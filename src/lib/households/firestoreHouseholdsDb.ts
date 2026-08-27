import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import {
  householdToDocument,
  inviteToDocument,
  joinMembershipToDocument,
  membershipToDocument,
  parseHouseholdDocument,
  parseHouseholdInviteDocument,
  parseHouseholdMemberDocument,
} from './converters'
import {
  AlreadyInHouseholdError,
  HouseholdAccessDeniedError,
  InviteNotFoundError,
} from './households'
import type {
  Household,
  HouseholdInvite,
  HouseholdMember,
  HouseholdsDb,
} from './types'

function isFirestorePermissionDenied(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false
  }
  const { code } = error
  return code === 'permission-denied' || code === 'firestore/permission-denied'
}

export function mapHouseholdFirestoreError(error: unknown): never {
  if (isFirestorePermissionDenied(error)) {
    throw new HouseholdAccessDeniedError()
  }
  throw error
}

async function withHouseholdAccess<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    mapHouseholdFirestoreError(error)
  }
}

export function createFirestoreHouseholdsDb(
  firestore: Firestore,
): HouseholdsDb {
  return {
    async createHouseholdAndMembership(input) {
      return withHouseholdAccess(async () => {
        const householdRef = doc(collection(firestore, 'households'))
        const memberRef = doc(firestore, 'household_members', input.userId)
        const now = Timestamp.now()

        await runTransaction(firestore, async (tx) => {
          const existing = await tx.get(memberRef)
          if (existing.exists()) {
            throw new AlreadyInHouseholdError()
          }
          tx.set(householdRef, {
            ...householdToDocument({
              name: input.name,
              monthlyBudget: input.monthlyBudget,
              createdAt: now.toDate(),
            }),
            created_at: now,
          })
          tx.set(memberRef, {
            ...membershipToDocument({
              householdId: householdRef.id,
              joinedAt: now.toDate(),
            }),
            joined_at: now,
          })
        })

        const household: Household = {
          id: householdRef.id,
          name: input.name,
          monthlyBudget: input.monthlyBudget,
          createdAt: now.toDate(),
        }
        return {
          household,
          member: {
            householdId: householdRef.id,
            userId: input.userId,
            joinedAt: now.toDate(),
          },
        }
      })
    },
    async getHousehold(householdId) {
      return withHouseholdAccess(async () => {
        const snap = await getDoc(doc(firestore, 'households', householdId))
        if (!snap.exists()) {
          throw new Error('Household not found')
        }
        return parseHouseholdDocument({ id: snap.id, data: snap.data() })
      })
    },
    async listMembers(householdId) {
      return withHouseholdAccess(async () => {
        const membersQuery = query(
          collection(firestore, 'household_members'),
          where('household_id', '==', householdId),
        )
        const snap = await getDocs(membersQuery)
        return snap.docs.map((memberDoc) =>
          parseHouseholdMemberDocument({
            userId: memberDoc.id,
            data: memberDoc.data(),
          }),
        )
      })
    },
    async updateMonthlyBudget(input) {
      return withHouseholdAccess(async () => {
        const householdRef = doc(firestore, 'households', input.householdId)
        const snap = await getDoc(householdRef)
        if (!snap.exists()) {
          throw new Error('Household not found')
        }
        const current = parseHouseholdDocument({
          id: snap.id,
          data: snap.data(),
        })
        await updateDoc(householdRef, { monthly_budget: input.monthlyBudget })
        return { ...current, monthlyBudget: input.monthlyBudget }
      })
    },
    async getOrCreateInvite(input) {
      return withHouseholdAccess(async () => {
        const invitesQuery = query(
          collection(firestore, 'household_invites'),
          where('household_id', '==', input.householdId),
        )
        const existing = await getDocs(invitesQuery)
        const existingDoc = existing.docs[0]
        if (existingDoc !== undefined) {
          return parseHouseholdInviteDocument({
            token: existingDoc.id,
            data: existingDoc.data(),
          })
        }

        const token = crypto.randomUUID()
        const now = Timestamp.now()
        const invite: HouseholdInvite = {
          householdId: input.householdId,
          token,
          createdAt: now.toDate(),
        }
        await setDoc(doc(firestore, 'household_invites', token), {
          ...inviteToDocument({
            householdId: invite.householdId,
            createdAt: invite.createdAt,
          }),
          created_at: now,
        })
        return invite
      })
    },
    async joinHousehold(input) {
      return withHouseholdAccess(async () => {
        if (input.token === '') {
          throw new InviteNotFoundError()
        }
        const inviteRef = doc(firestore, 'household_invites', input.token)
        const memberRef = doc(firestore, 'household_members', input.userId)

        return runTransaction(firestore, async (tx) => {
          const inviteSnap = await tx.get(inviteRef)
          if (!inviteSnap.exists()) {
            throw new InviteNotFoundError()
          }
          const invite = parseHouseholdInviteDocument({
            token: inviteSnap.id,
            data: inviteSnap.data(),
          })
          const existing = await tx.get(memberRef)
          if (existing.exists()) {
            const member = parseHouseholdMemberDocument({
              userId: input.userId,
              data: existing.data(),
            })
            if (member.householdId === invite.householdId) {
              return member
            }
            throw new AlreadyInHouseholdError()
          }
          const now = Timestamp.now()
          const member: HouseholdMember = {
            householdId: invite.householdId,
            userId: input.userId,
            joinedAt: now.toDate(),
          }
          tx.set(memberRef, {
            ...joinMembershipToDocument({
              householdId: member.householdId,
              joinedAt: member.joinedAt,
              inviteToken: input.token,
            }),
            joined_at: now,
          })
          return member
        })
      })
    },
  }
}

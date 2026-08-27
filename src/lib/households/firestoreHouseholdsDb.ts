import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import {
  householdToDocument,
  membershipToDocument,
  parseHouseholdDocument,
  parseHouseholdMemberDocument,
} from './converters'
import { AlreadyInHouseholdError } from './households'
import type { Household, HouseholdsDb } from './types'

export function createFirestoreHouseholdsDb(
  firestore: Firestore,
): HouseholdsDb {
  return {
    async createHouseholdAndMembership(input) {
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
    },
    async getHousehold(householdId) {
      const snap = await getDoc(doc(firestore, 'households', householdId))
      if (!snap.exists()) {
        throw new Error('Household not found')
      }
      return parseHouseholdDocument({ id: snap.id, data: snap.data() })
    },
    async listMembers(householdId) {
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
    },
    async updateMonthlyBudget(input) {
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
    },
  }
}

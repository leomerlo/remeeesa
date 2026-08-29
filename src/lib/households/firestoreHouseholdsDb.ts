import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import {
  categoryToDocument,
  expenseToDocument,
  parseCategoryDocument,
  parseExpenseDocument,
  toFirestoreExpenseDate,
} from '@/lib/expenses/converters'
import { ExpenseNotFoundError } from '@/lib/expenses/expenses'
import { categoryDocumentId, defaultCategoryRecords } from '@/lib/expenses/seed'
import { parseCategoryName } from '@/lib/expenses/validate'
import { logFirebaseError } from '@/lib/firebaseDevLog'
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

async function withHouseholdAccess<T>(
  operation: string,
  run: () => Promise<T>,
  details?: Record<string, unknown>,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    logFirebaseError(error, operation, details)
    mapHouseholdFirestoreError(error)
  }
}

function authenticatedUserId(firestore: Firestore): string {
  const userId = getAuth(firestore.app).currentUser?.uid
  if (userId === undefined) {
    throw new HouseholdAccessDeniedError()
  }
  return userId
}

async function awaitAuthenticatedUserId(firestore: Firestore): Promise<string> {
  await getAuth(firestore.app).authStateReady()
  return authenticatedUserId(firestore)
}

export function createFirestoreHouseholdsDb(
  firestore: Firestore,
): HouseholdsDb {
  return {
    async createHouseholdAndMembership(input) {
      return withHouseholdAccess('createHouseholdAndMembership', async () => {
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
          for (const category of defaultCategoryRecords({
            householdId: householdRef.id,
            createdAt: now.toDate(),
          })) {
            tx.set(doc(firestore, 'categories', category.id), {
              ...categoryToDocument({
                householdId: category.householdId,
                name: category.name,
                createdAt: category.createdAt,
              }),
              created_at: now,
            })
          }
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
      return withHouseholdAccess('getHousehold', async () => {
        const snap = await getDoc(doc(firestore, 'households', householdId))
        if (!snap.exists()) {
          throw new Error('Household not found')
        }
        return parseHouseholdDocument({ id: snap.id, data: snap.data() })
      })
    },
    async listMembers(householdId) {
      return withHouseholdAccess('listMembers', async () => {
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
    async getMembership(userId) {
      return withHouseholdAccess('getMembership', async () => {
        const snap = await getDoc(doc(firestore, 'household_members', userId))
        if (!snap.exists()) {
          return null
        }
        return parseHouseholdMemberDocument({
          userId: snap.id,
          data: snap.data(),
        })
      })
    },
    async updateMonthlyBudget(input) {
      return withHouseholdAccess('updateMonthlyBudget', async () => {
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
      return withHouseholdAccess('getOrCreateInvite', async () => {
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
      return withHouseholdAccess('joinHousehold', async () => {
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
    async leaveHousehold(input) {
      await deleteDoc(doc(firestore, 'household_members', input.userId))
    },
    async listCategories(householdId) {
      return withHouseholdAccess('listCategories', async () => {
        const categoriesQuery = query(
          collection(firestore, 'categories'),
          where('household_id', '==', householdId),
        )
        const snap = await getDocs(categoriesQuery)
        return snap.docs.map((categoryDoc) =>
          parseCategoryDocument({
            id: categoryDoc.id,
            data: categoryDoc.data(),
          }),
        )
      })
    },
    async findOrCreateCategory(input) {
      return withHouseholdAccess(
        'findOrCreateCategory',
        async () => {
          await getAuth(firestore.app).authStateReady()
          const name = parseCategoryName(input.name)
          const categoryId = categoryDocumentId({
            householdId: input.householdId,
            name,
          })
          const categoryRef = doc(firestore, 'categories', categoryId)
          const existing = await getDoc(categoryRef)
          if (existing.exists()) {
            return parseCategoryDocument({
              id: existing.id,
              data: existing.data(),
            })
          }

          const now = Timestamp.now()
          const createdAt = now.toDate()
          try {
            await setDoc(categoryRef, {
              ...categoryToDocument({
                householdId: input.householdId,
                name,
                createdAt,
              }),
              created_at: now,
            })
          } catch (error) {
            if (!isFirestorePermissionDenied(error)) {
              throw error
            }
            const raced = await getDoc(categoryRef)
            if (!raced.exists()) {
              throw error
            }
            return parseCategoryDocument({
              id: raced.id,
              data: raced.data(),
            })
          }

          return {
            id: categoryId,
            householdId: input.householdId,
            name,
            createdAt,
          }
        },
        { householdId: input.householdId, categoryName: input.name },
      )
    },
    async createExpense(input) {
      return withHouseholdAccess('createExpense', async () => {
        const memberId = authenticatedUserId(firestore)
        const expenseRef = doc(collection(firestore, 'expenses'))
        const now = Timestamp.now()
        const createdAt = now.toDate()
        await setDoc(expenseRef, {
          ...expenseToDocument({
            householdId: input.householdId,
            categoryId: input.categoryId,
            memberId,
            authorDisplayName: input.authorDisplayName,
            name: input.name,
            price: input.price,
            comments: input.comments,
            expenseDate: input.expenseDate,
            createdAt,
          }),
          expense_date: toFirestoreExpenseDate(input.expenseDate),
          created_at: now,
        })
        return {
          id: expenseRef.id,
          householdId: input.householdId,
          categoryId: input.categoryId,
          memberId,
          authorDisplayName: input.authorDisplayName,
          name: input.name,
          price: input.price,
          comments: input.comments,
          expenseDate: input.expenseDate,
          createdAt,
        }
      })
    },
    async listExpensesInMonth(input) {
      return withHouseholdAccess('listExpensesInMonth', async () => {
        const expensesQuery = query(
          collection(firestore, 'expenses'),
          where('household_id', '==', input.householdId),
          where('expense_date', '>=', Timestamp.fromDate(input.monthStart)),
          where('expense_date', '<=', Timestamp.fromDate(input.monthEnd)),
          orderBy('expense_date', 'desc'),
          orderBy('created_at', 'desc'),
        )
        const snap = await getDocs(expensesQuery)
        return snap.docs.map((expenseDoc) =>
          parseExpenseDocument({
            id: expenseDoc.id,
            data: expenseDoc.data(),
          }),
        )
      })
    },
    async getExpense(input) {
      return withHouseholdAccess('getExpense', async () => {
        const expenseRef = doc(firestore, 'expenses', input.expenseId)
        const existing = await getDoc(expenseRef)
        if (
          !existing.exists() ||
          existing.data().household_id !== input.householdId
        ) {
          return null
        }
        return parseExpenseDocument({
          id: existing.id,
          data: existing.data(),
        })
      })
    },
    async updateExpense(input) {
      return withHouseholdAccess(
        'updateExpense',
        async () => {
          await awaitAuthenticatedUserId(firestore)
          const expenseRef = doc(firestore, 'expenses', input.expenseId)
          const existing = await getDoc(expenseRef)
          if (
            !existing.exists() ||
            existing.data().household_id !== input.householdId
          ) {
            throw new ExpenseNotFoundError()
          }
          const current = parseExpenseDocument({
            id: existing.id,
            data: existing.data(),
          })
          await updateDoc(expenseRef, {
            category_id: input.categoryId,
            name: input.name,
            price: input.price,
            comments: input.comments,
            expense_date: toFirestoreExpenseDate(input.expenseDate),
          })
          return {
            ...current,
            categoryId: input.categoryId,
            name: input.name,
            price: input.price,
            comments: input.comments,
            expenseDate: input.expenseDate,
          }
        },
        {
          authUserId: getAuth(firestore.app).currentUser?.uid,
          expenseId: input.expenseId,
          householdId: input.householdId,
          categoryId: input.categoryId,
        },
      )
    },
    async deleteExpense(input) {
      return withHouseholdAccess('deleteExpense', async () => {
        const expenseRef = doc(firestore, 'expenses', input.expenseId)
        const existing = await getDoc(expenseRef)
        if (
          !existing.exists() ||
          existing.data().household_id !== input.householdId
        ) {
          throw new ExpenseNotFoundError()
        }
        await deleteDoc(expenseRef)
      })
    },
  }
}

import {
  collection,
  deleteDoc,
  doc,
  writeBatch,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { DocumentReference, Firestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import {
  pendienteToDocument,
  parsePendienteDocument,
  toFirestorePendienteDate,
} from '@/lib/pendientes/converters'
import {
  PendienteAlreadyPaidError,
  PendienteNotFoundError,
} from '@/lib/pendientes/pendientes'
import { nextCycleDueDate } from '@/lib/pendientes/recurrence'
import { chunkForWriteBatch } from '@/lib/expenses/batching'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import {
  categoryToDocument,
  expenseToDocument,
  parseCategoryDocument,
  parseExpenseDocument,
  toFirestoreExpenseDate,
} from '@/lib/expenses/converters'
import {
  CategoryInUseError,
  CategoryNameTakenError,
  CategoryNotFoundError,
} from '@/lib/expenses/categoryManagement'
import { ExpenseNotFoundError } from '@/lib/expenses/expenses'
import {
  buildExpenseHistoryPage,
  EXPENSE_HISTORY_PAGE_SIZE,
} from '@/lib/expenses/history'
import { categoryDocumentId, defaultCategoryRecords } from '@/lib/expenses/seed'
import { parseCategoryColor, parseCategoryName } from '@/lib/expenses/validate'
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
  FirestoreDeniedError,
  InviteNotFoundError,
  NotSignedInError,
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

function firestoreErrorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return 'permission-denied'
  }
  const { code } = error
  return typeof code === 'string' && code.length > 0
    ? code
    : 'permission-denied'
}

function firestoreErrorDetail(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return undefined
  }
  const { message } = error
  return typeof message === 'string' && message.length > 0 ? message : undefined
}

export function mapHouseholdFirestoreError(
  error: unknown,
  operation = 'request',
): never {
  if (isFirestorePermissionDenied(error)) {
    throw new FirestoreDeniedError({
      operation,
      code: firestoreErrorCode(error),
      detail: firestoreErrorDetail(error),
    })
  }
  throw error
}

// Every document that stores this category's id, across both collections that
// can hold one. Rename and merge move all of them; delete refuses while any
// exist. Pendientes are queried alongside Expenses on purpose -- forgetting them
// is what would leave paid bills pointing at a category that no longer exists.
async function categoryReferences(
  firestore: Firestore,
  input: { readonly householdId: string; readonly categoryId: string },
) {
  const [expensesSnap, pendientesSnap] = await Promise.all(
    (['expenses', 'pendientes'] as const).map((collectionName) =>
      getDocs(
        query(
          collection(firestore, collectionName),
          where('household_id', '==', input.householdId),
          where('category_id', '==', input.categoryId),
        ),
      ),
    ),
  )
  return [...(expensesSnap?.docs ?? []), ...(pendientesSnap?.docs ?? [])].map(
    (referencing) => referencing.ref,
  )
}

// Batched rather than transactional: a household can accumulate more
// references than one transaction may touch. The repoint therefore runs before
// the old category doc is deleted, so an interrupted run leaves references
// split across two categories that both still exist -- untidy, and fixable by
// repeating the operation, but never an orphan pointing at a missing doc.
async function repointCategoryReferences(
  firestore: Firestore,
  refs: readonly DocumentReference[],
  toCategoryId: string,
): Promise<void> {
  for (const chunk of chunkForWriteBatch(refs)) {
    const batch = writeBatch(firestore)
    for (const ref of chunk) {
      batch.update(ref, { category_id: toCategoryId })
    }
    await batch.commit()
  }
}

async function readOwnCategory(
  firestore: Firestore,
  input: { readonly householdId: string; readonly categoryId: string },
) {
  const snap = await getDoc(doc(firestore, 'categories', input.categoryId))
  if (!snap.exists()) {
    throw new CategoryNotFoundError()
  }
  const category = parseCategoryDocument({ id: snap.id, data: snap.data() })
  if (category.householdId !== input.householdId) {
    throw new CategoryNotFoundError()
  }
  return category
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
    mapHouseholdFirestoreError(error, operation)
  }
}

function authenticatedUserId(firestore: Firestore): string {
  const userId = getAuth(firestore.app).currentUser?.uid
  if (userId === undefined) {
    throw new NotSignedInError()
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
              displayName: input.displayName,
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
                color: category.color,
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
            displayName: input.displayName,
          },
        }
      })
    },
    async getHousehold(householdId) {
      return withHouseholdAccess('getHousehold', async () => {
        const snap = await getDoc(doc(firestore, 'households', householdId))
        if (!snap.exists()) {
          throw new Error('No se encontró el hogar')
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
          throw new Error('No se encontró el hogar')
        }
        const current = parseHouseholdDocument({
          id: snap.id,
          data: snap.data(),
        })
        await updateDoc(householdRef, { monthly_budget: input.monthlyBudget })
        return { ...current, monthlyBudget: input.monthlyBudget }
      })
    },
    async updateHousehold(input) {
      return withHouseholdAccess('updateHousehold', async () => {
        const householdRef = doc(firestore, 'households', input.householdId)
        const snap = await getDoc(householdRef)
        if (!snap.exists()) {
          throw new Error('No se encontró el hogar')
        }
        const current = parseHouseholdDocument({
          id: snap.id,
          data: snap.data(),
        })
        await updateDoc(householdRef, {
          name: input.name,
          monthly_budget: input.monthlyBudget,
        })
        return {
          ...current,
          name: input.name,
          monthlyBudget: input.monthlyBudget,
        }
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
            displayName: input.displayName,
          }
          tx.set(memberRef, {
            ...joinMembershipToDocument({
              householdId: member.householdId,
              joinedAt: member.joinedAt,
              inviteToken: input.token,
              displayName: member.displayName,
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
    async updateMemberDisplayName(input) {
      return withHouseholdAccess('updateMemberDisplayName', async () => {
        const memberRef = doc(firestore, 'household_members', input.userId)
        const snap = await getDoc(memberRef)
        if (!snap.exists()) {
          throw new Error('No se encontró la membresía')
        }
        const current = parseHouseholdMemberDocument({
          userId: snap.id,
          data: snap.data(),
        })
        await updateDoc(memberRef, { display_name: input.displayName })
        return { ...current, displayName: input.displayName }
      })
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
          const color = colorForCategoryName(name)
          try {
            await setDoc(categoryRef, {
              ...categoryToDocument({
                householdId: input.householdId,
                name,
                color,
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
            color,
            createdAt,
          }
        },
        { householdId: input.householdId, categoryName: input.name },
      )
    },
    async updateCategoryColor(input) {
      return withHouseholdAccess(
        'updateCategoryColor',
        async () => {
          const existing = await readOwnCategory(firestore, input)
          const color = parseCategoryColor(input.color)
          await updateDoc(doc(firestore, 'categories', existing.id), { color })
          return { ...existing, color }
        },
        { householdId: input.householdId, categoryId: input.categoryId },
      )
    },
    async renameCategory(input) {
      return withHouseholdAccess(
        'renameCategory',
        async () => {
          const existing = await readOwnCategory(firestore, input)
          const name = parseCategoryName(input.name)
          const newId = categoryDocumentId({
            householdId: input.householdId,
            name,
          })

          // Same id means only the casing or spacing changed, so there is
          // nothing to repoint -- just rewrite the name on the doc in place.
          if (newId === existing.id) {
            await updateDoc(doc(firestore, 'categories', existing.id), { name })
            return { ...existing, name }
          }

          // Checked before a single write, so a rejected rename leaves no
          // half-moved references behind.
          const collision = await getDoc(doc(firestore, 'categories', newId))
          if (collision.exists()) {
            throw new CategoryNameTakenError()
          }

          const renamed = { ...existing, id: newId, name }
          await setDoc(doc(firestore, 'categories', newId), {
            ...categoryToDocument({
              householdId: existing.householdId,
              name,
              color: existing.color,
              createdAt: existing.createdAt,
            }),
            created_at: Timestamp.fromDate(existing.createdAt),
          })
          const refs = await categoryReferences(firestore, input)
          await repointCategoryReferences(firestore, refs, newId)
          await deleteDoc(doc(firestore, 'categories', existing.id))
          return renamed
        },
        { householdId: input.householdId, categoryId: input.categoryId },
      )
    },
    async deleteCategory(input) {
      return withHouseholdAccess(
        'deleteCategory',
        async () => {
          const existing = await readOwnCategory(firestore, input)
          const refs = await categoryReferences(firestore, input)
          if (refs.length > 0) {
            throw new CategoryInUseError()
          }
          await deleteDoc(doc(firestore, 'categories', existing.id))
        },
        { householdId: input.householdId, categoryId: input.categoryId },
      )
    },
    async mergeCategories(input) {
      return withHouseholdAccess(
        'mergeCategories',
        async () => {
          const source = await readOwnCategory(firestore, {
            householdId: input.householdId,
            categoryId: input.sourceCategoryId,
          })
          // Read for its side effect: merging into a category that is missing
          // or belongs to another household would orphan every reference we
          // are about to move onto it.
          await readOwnCategory(firestore, {
            householdId: input.householdId,
            categoryId: input.survivorCategoryId,
          })
          if (source.id === input.survivorCategoryId) {
            throw new Error('No se puede unir una categoría consigo misma')
          }
          const refs = await categoryReferences(firestore, {
            householdId: input.householdId,
            categoryId: input.sourceCategoryId,
          })
          await repointCategoryReferences(
            firestore,
            refs,
            input.survivorCategoryId,
          )
          await deleteDoc(doc(firestore, 'categories', source.id))
        },
        {
          householdId: input.householdId,
          sourceCategoryId: input.sourceCategoryId,
        },
      )
    },
    async createExpense(input) {
      return withHouseholdAccess(
        'createExpense',
        async () => {
          const memberId = await awaitAuthenticatedUserId(firestore)
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
        },
        {
          authUserId: getAuth(firestore.app).currentUser?.uid,
          householdId: input.householdId,
          categoryId: input.categoryId,
        },
      )
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
    async listRecentExpenses(input) {
      return withHouseholdAccess('listRecentExpenses', async () => {
        const expensesQuery = query(
          collection(firestore, 'expenses'),
          where('household_id', '==', input.householdId),
          orderBy('expense_date', 'desc'),
          orderBy('created_at', 'desc'),
          limit(input.limit),
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
    async listExpenseHistoryPage(input) {
      return withHouseholdAccess('listExpenseHistoryPage', async () => {
        const afterCursor =
          input.after === undefined
            ? []
            : [
                startAfter(
                  Timestamp.fromDate(input.after.expenseDate),
                  Timestamp.fromDate(input.after.createdAt),
                ),
              ]

        // One row beyond the page size, in the same single query, tells
        // buildExpenseHistoryPage whether there's more without a second
        // round trip -- ordered on the household_id/expense_date/created_at
        // index every other expense query already uses (expense_date alone
        // would make Firestore append an implicit __name__ sort, a
        // *different* composite index that fails in production with "The
        // query requires an index").
        const historyQuery = query(
          collection(firestore, 'expenses'),
          where('household_id', '==', input.householdId),
          orderBy('expense_date', 'desc'),
          orderBy('created_at', 'desc'),
          ...afterCursor,
          limit(EXPENSE_HISTORY_PAGE_SIZE + 1),
        )
        const snap = await getDocs(historyQuery)
        const expenses = snap.docs.map((expenseDoc) =>
          parseExpenseDocument({
            id: expenseDoc.id,
            data: expenseDoc.data(),
          }),
        )

        return buildExpenseHistoryPage(expenses)
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
            member_id: input.memberId,
            author_display_name: input.authorDisplayName,
          })
          return {
            ...current,
            categoryId: input.categoryId,
            name: input.name,
            price: input.price,
            comments: input.comments,
            expenseDate: input.expenseDate,
            memberId: input.memberId,
            authorDisplayName: input.authorDisplayName,
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
    async createPendiente(input) {
      return withHouseholdAccess(
        'createPendiente',
        async () => {
          const recurring = input.recurring ?? false
          const pendienteRef = doc(collection(firestore, 'pendientes'))
          const now = Timestamp.now()
          const createdAt = now.toDate()
          await setDoc(pendienteRef, {
            ...pendienteToDocument({
              householdId: input.householdId,
              categoryId: input.categoryId,
              name: input.name,
              dueDate: input.dueDate,
              expectedAmount: input.expectedAmount,
              recurring,
              status: 'pending',
              paidExpenseId: null,
              paidAt: null,
              createdAt,
            }),
            due_date: toFirestorePendienteDate(input.dueDate),
            created_at: now,
          })
          return {
            id: pendienteRef.id,
            householdId: input.householdId,
            categoryId: input.categoryId,
            name: input.name,
            dueDate: input.dueDate,
            expectedAmount: input.expectedAmount,
            recurring,
            status: 'pending',
            paidExpenseId: null,
            paidAt: null,
            createdAt,
          }
        },
        { householdId: input.householdId, categoryId: input.categoryId },
      )
    },
    async getPendiente(input) {
      return withHouseholdAccess('getPendiente', async () => {
        const pendienteRef = doc(firestore, 'pendientes', input.pendienteId)
        const existing = await getDoc(pendienteRef)
        if (
          !existing.exists() ||
          existing.data().household_id !== input.householdId
        ) {
          return null
        }
        return parsePendienteDocument({
          id: existing.id,
          data: existing.data(),
        })
      })
    },
    async listPendientes(input) {
      return withHouseholdAccess('listPendientes', async () => {
        const pendientesQuery = query(
          collection(firestore, 'pendientes'),
          where('household_id', '==', input.householdId),
          where('status', '==', 'pending'),
          orderBy('due_date', 'asc'),
        )
        const snap = await getDocs(pendientesQuery)
        return snap.docs.map((pendienteDoc) =>
          parsePendienteDocument({
            id: pendienteDoc.id,
            data: pendienteDoc.data(),
          }),
        )
      })
    },
    async updatePendiente(input) {
      return withHouseholdAccess(
        'updatePendiente',
        async () => {
          const pendienteRef = doc(firestore, 'pendientes', input.pendienteId)
          const existing = await getDoc(pendienteRef)
          if (
            !existing.exists() ||
            existing.data().household_id !== input.householdId
          ) {
            throw new PendienteNotFoundError()
          }
          const current = parsePendienteDocument({
            id: existing.id,
            data: existing.data(),
          })
          // Re-check status against this fresh read (not just the domain
          // layer's earlier getPendiente) so a pendiente paid by someone else
          // between that check and this write surfaces the specific
          // PendienteAlreadyPaidError the UI knows how to handle gracefully,
          // rather than a generic FirestoreDeniedError from the rules-level
          // rejection that would follow anyway.
          if (current.status !== 'pending') {
            throw new PendienteAlreadyPaidError()
          }
          await updateDoc(pendienteRef, {
            category_id: input.categoryId,
            name: input.name,
            due_date: toFirestorePendienteDate(input.dueDate),
            expected_amount: input.expectedAmount,
            recurring: input.recurring,
          })
          return {
            ...current,
            categoryId: input.categoryId,
            name: input.name,
            dueDate: input.dueDate,
            expectedAmount: input.expectedAmount,
            recurring: input.recurring,
          }
        },
        {
          pendienteId: input.pendienteId,
          householdId: input.householdId,
          categoryId: input.categoryId,
        },
      )
    },
    async deletePendiente(input) {
      return withHouseholdAccess('deletePendiente', async () => {
        const pendienteRef = doc(firestore, 'pendientes', input.pendienteId)
        const existing = await getDoc(pendienteRef)
        if (
          !existing.exists() ||
          existing.data().household_id !== input.householdId
        ) {
          throw new PendienteNotFoundError()
        }
        // Same fresh re-check as updatePendiente above -- surfaces
        // PendienteAlreadyPaidError instead of a generic denial if the pendiente
        // was marked paid by someone else after the domain layer's own
        // pre-check.
        if (
          parsePendienteDocument({ id: existing.id, data: existing.data() })
            .status !== 'pending'
        ) {
          throw new PendienteAlreadyPaidError()
        }
        await deleteDoc(pendienteRef)
      })
    },
    async markPendientePaid(input) {
      return withHouseholdAccess(
        'markPendientePaid',
        async () => {
          const memberId = await awaitAuthenticatedUserId(firestore)
          const pendienteRef = doc(firestore, 'pendientes', input.pendienteId)
          const expenseRef = doc(collection(firestore, 'expenses'))
          // Hoisted out of the transaction callback deliberately: the
          // callback is re-run on contention, and a ref minted inside it
          // would take a different id on each attempt, so the id written
          // could drift from the one returned to the caller. This only mints
          // a client-side id -- nothing is written -- so leaving it unused on
          // the non-recurring path creates no orphan document.
          const nextPendienteRef = doc(collection(firestore, 'pendientes'))
          const now = Timestamp.now()
          const createdAt = now.toDate()

          return runTransaction(firestore, async (tx) => {
            const pendienteSnap = await tx.get(pendienteRef)
            if (
              !pendienteSnap.exists() ||
              pendienteSnap.data().household_id !== input.householdId
            ) {
              throw new PendienteNotFoundError()
            }
            const current = parsePendienteDocument({
              id: pendienteSnap.id,
              data: pendienteSnap.data(),
            })
            if (current.status !== 'pending') {
              throw new PendienteAlreadyPaidError()
            }

            tx.set(expenseRef, {
              ...expenseToDocument({
                householdId: input.householdId,
                categoryId: current.categoryId,
                memberId,
                authorDisplayName: input.authorDisplayName,
                name: current.name,
                price: input.finalAmount,
                comments: '',
                expenseDate: input.paymentDate,
                createdAt,
              }),
              expense_date: toFirestoreExpenseDate(input.paymentDate),
              created_at: now,
            })
            tx.update(pendienteRef, {
              status: 'paid',
              paid_expense_id: expenseRef.id,
              paid_at: toFirestorePendienteDate(input.paymentDate),
            })

            // A recurring pendiente spawns its next cycle in this same
            // transaction, so all three writes land together or not at all.
            // The expected amount carries over from the cycle just paid --
            // most recurring bills (rent, subscriptions) cost the same
            // amount next cycle too, so this is a pre-fill the user can
            // still edit, not a guess pulled from nowhere.
            const nextDueDate = current.recurring
              ? nextCycleDueDate(current.dueDate)
              : null
            if (nextDueDate !== null) {
              tx.set(nextPendienteRef, {
                ...pendienteToDocument({
                  householdId: input.householdId,
                  categoryId: current.categoryId,
                  name: current.name,
                  dueDate: nextDueDate,
                  expectedAmount: input.finalAmount,
                  recurring: true,
                  status: 'pending',
                  paidExpenseId: null,
                  paidAt: null,
                  createdAt,
                }),
                due_date: toFirestorePendienteDate(nextDueDate),
                created_at: now,
              })
            }

            return {
              pendiente: {
                ...current,
                status: 'paid' as const,
                paidExpenseId: expenseRef.id,
                paidAt: input.paymentDate,
              },
              nextPendiente:
                nextDueDate === null
                  ? null
                  : {
                      id: nextPendienteRef.id,
                      householdId: input.householdId,
                      categoryId: current.categoryId,
                      name: current.name,
                      dueDate: nextDueDate,
                      expectedAmount: input.finalAmount,
                      recurring: true,
                      status: 'pending' as const,
                      paidExpenseId: null,
                      paidAt: null,
                      createdAt,
                    },
              expense: {
                id: expenseRef.id,
                householdId: input.householdId,
                categoryId: current.categoryId,
                memberId,
                authorDisplayName: input.authorDisplayName,
                name: current.name,
                price: input.finalAmount,
                comments: '',
                expenseDate: input.paymentDate,
                createdAt,
              },
            }
          })
        },
        {
          pendienteId: input.pendienteId,
          householdId: input.householdId,
        },
      )
    },
  }
}

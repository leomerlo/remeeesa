import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import {
  arrayRemove,
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
import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import {
  parseCardDocument,
  parseCardPurchaseDocument,
} from '@/lib/cards/converters'
import {
  applyResumenChange,
  cuotasOf,
  resumenChanges,
  resumenIdFor,
  resumenNameFor,
} from '@/lib/cards/cuotas'
import type { CardPurchase } from '@/lib/cards/types'
import type { Expense } from '@/lib/expenses/types'
import {
  CardNotFoundError,
  CardPurchaseLockedError,
  CardPurchaseNotFoundError,
  RESUMEN_DUE_DAY,
  ResumenAlreadyPaidError,
  resumenMonthStart,
  resumenPayment,
} from '@/lib/cards/purchases'
import {
  pendienteToDocument,
  parsePendienteDocument,
  toFirestorePendienteDate,
} from '@/lib/pendientes/converters'
import {
  PendienteAlreadyPaidError,
  PendienteNotFoundError,
  PendienteNotPaidError,
} from '@/lib/pendientes/pendientes'
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
import { monthKey } from './monthlyBudget'
import {
  parseCategoryBudget,
  parseCategoryColor,
  parseCategoryName,
} from '@/lib/expenses/validate'
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

// Every document that stores this category's id, across every collection that
// can hold one. Rename and merge move all of them; delete refuses while any
// exist. Pendientes and card purchases are queried alongside Expenses on
// purpose -- forgetting one is what would leave it pointing at a category that
// no longer exists.
async function categoryReferences(
  firestore: Firestore,
  input: { readonly householdId: string; readonly categoryId: string },
) {
  const snaps = await Promise.all(
    (['expenses', 'pendientes', 'card_purchases'] as const).map(
      (collectionName) =>
        getDocs(
          query(
            collection(firestore, collectionName),
            where('household_id', '==', input.householdId),
            where('category_id', '==', input.categoryId),
          ),
        ),
    ),
  )
  return snaps
    .flatMap((snap) => snap.docs)
    .map((referencing) => referencing.ref)
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

// A Resumen's first write, from the purchase with a cuota in its month.
function newResumenDocument(input: {
  readonly householdId: string
  readonly resumenCategoryId: string
  readonly cardId: string
  readonly cardName: string
  readonly monthStart: Date
  readonly amount: number
  readonly purchaseId: string
  readonly currency: Currency
  readonly now: Timestamp
}): Record<string, unknown> {
  const dueDate = new Date(
    input.monthStart.getFullYear(),
    input.monthStart.getMonth(),
    RESUMEN_DUE_DAY,
  )
  return {
    ...pendienteToDocument({
      householdId: input.householdId,
      categoryId: input.resumenCategoryId,
      name: resumenNameFor(input.cardName, input.currency),
      dueDate,
      expectedAmount: input.amount,
      recurring: false,
      autoDebit: false,
      status: 'pending',
      paidExpenseId: null,
      paidAt: null,
      createdAt: input.now.toDate(),
    }),
    due_date: toFirestorePendienteDate(dueDate),
    created_at: input.now,
    card_id: input.cardId,
    // What this Resumen settles in, and therefore what paying it records.
    // Written here rather than read back off the card, which may hold both.
    currency: input.currency,
    purchase_ids: [input.purchaseId],
  }
}

// The edit/delete transaction's shared half: reads the purchase and every
// Resumen it is in before or after (after = null deletes it), rejects if any
// is paid, then moves the cuotas. Every read lands before any write, as
// transactions require; the caller writes the purchase itself afterwards.
async function moveCardPurchaseCuotas(input: {
  readonly firestore: Firestore
  readonly tx: Transaction
  readonly householdId: string
  readonly purchaseId: string
  readonly after: (before: CardPurchase) => {
    readonly purchase: CardPurchase
    readonly cardName: string
    readonly resumenCategoryId: string
  } | null
}): Promise<CardPurchase | null> {
  const { firestore, tx } = input
  // Rules deny reading a missing purchase (no resource to check), so a
  // purchase another member just deleted reads as denied, not as missing.
  const purchaseSnap = await tx
    .get(doc(firestore, 'card_purchases', input.purchaseId))
    .catch((error: unknown) => {
      throw isFirestorePermissionDenied(error)
        ? new CardPurchaseNotFoundError()
        : error
    })
  if (
    !purchaseSnap.exists() ||
    purchaseSnap.data().household_id !== input.householdId
  ) {
    throw new CardPurchaseNotFoundError()
  }
  const before = parseCardPurchaseDocument({
    id: purchaseSnap.id,
    data: purchaseSnap.data(),
  })
  if (before.paidResumenIds.length > 0) {
    throw new CardPurchaseLockedError()
  }
  const after = input.after(before)
  const changes = resumenChanges(before, after?.purchase ?? null)
  const refs = changes.map((change) => doc(firestore, 'pendientes', change.id))
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)))
  const existing = snaps.map((snap) =>
    snap.exists()
      ? parsePendienteDocument({ id: snap.id, data: snap.data() })
      : null,
  )
  changes.forEach((change, index) => {
    const resumen = existing[index]
    if (resumen?.status === 'paid') {
      throw new ResumenAlreadyPaidError(resumen.name, change.monthStart)
    }
  })

  const now = Timestamp.now()
  changes.forEach((change, index) => {
    const ref = refs[index]
    const resumen = existing[index]
    if (ref === undefined) {
      return
    }
    if (resumen === null || resumen === undefined) {
      if (change.holdsPurchase && after !== null) {
        tx.set(
          ref,
          newResumenDocument({
            householdId: input.householdId,
            resumenCategoryId: after.resumenCategoryId,
            cardId: after.purchase.cardId,
            cardName: after.cardName,
            monthStart: change.monthStart,
            amount: change.cents / 100,
            purchaseId: before.id,
            currency: change.currency,
            now,
          }),
        )
      }
      return
    }
    const next = applyResumenChange(resumen, change, before.id)
    if (next === null) {
      tx.delete(ref)
      return
    }
    // A pure rename or recategorisation leaves the cuotas where they were.
    if (
      change.cents !== 0 ||
      next.purchaseIds.length !== (resumen.purchaseIds ?? []).length
    ) {
      tx.update(ref, {
        expected_amount: next.expectedAmount,
        purchase_ids: next.purchaseIds,
      })
    }
  })
  return after?.purchase ?? null
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
              // The month the household is created in is the first one it
              // ever ran on, so it gets a snapshot right away rather than
              // falling through to the bare monthly_budget field.
              monthlyBudgets: { [monthKey(now.toDate())]: input.monthlyBudget },
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
                monthlyBudget: category.monthlyBudget,
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
          monthlyBudgets: { [monthKey(now.toDate())]: input.monthlyBudget },
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
        // monthly_budgets as well as monthly_budget: the snapshots are
        // where a month's own figure lives, and writing only the flat field
        // means the save appears to work while every month keeps reading
        // the same number. See lib/households/monthlyBudget.
        await updateDoc(householdRef, {
          monthly_budget: input.monthlyBudget,
          monthly_budgets: input.monthlyBudgets,
        })
        return {
          ...current,
          monthlyBudget: input.monthlyBudget,
          monthlyBudgets: input.monthlyBudgets,
        }
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
          monthly_budgets: input.monthlyBudgets,
        })
        return {
          ...current,
          name: input.name,
          monthlyBudget: input.monthlyBudget,
          monthlyBudgets: input.monthlyBudgets,
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
                // A category is born with no ceiling; one is set later, from
                // Categorías, only on the ones the household cares about.
                monthlyBudget: 0,
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
            monthlyBudget: 0,
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
    async updateCategoryBudget(input) {
      return withHouseholdAccess(
        'updateCategoryBudget',
        async () => {
          const existing = await readOwnCategory(firestore, input)
          const monthlyBudget = parseCategoryBudget(input.monthlyBudget)
          await updateDoc(doc(firestore, 'categories', existing.id), {
            monthly_budget: monthlyBudget,
          })
          return { ...existing, monthlyBudget }
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
              // A rename is a create-repoint-delete, so everything the old
              // doc carried has to be copied across or it is lost -- the
              // ceiling included.
              monthlyBudget: existing.monthlyBudget,
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
              pendienteId: null,
              isService: false,
              subcategory: null,
              currency: input.currency ?? DEFAULT_CURRENCY,
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
            pendienteId: null,
            isService: false,
            subcategory: null,
            currency: input.currency ?? DEFAULT_CURRENCY,
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
    async listAllExpenses(input) {
      return withHouseholdAccess('listAllExpenses', async () => {
        // No limit and no cursor: the same index every other expense query
        // uses, read in one round trip. See the interface for why the paged
        // walk this replaced was the wrong shape for a search.
        const expensesQuery = query(
          collection(firestore, 'expenses'),
          where('household_id', '==', input.householdId),
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
            is_service: input.isService,
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
            isService: input.isService,
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
              autoDebit: input.autoDebit ?? false,
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
            autoDebit: input.autoDebit ?? false,
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
    async listPaidPendientesDueInMonth(input) {
      return withHouseholdAccess('listPaidPendientesDueInMonth', async () => {
        // By due_date, not paid_at: a servicio belongs to the month it was
        // due for, whichever month it happened to be settled in. Reuses the
        // household_id + status + due_date index the pending query already
        // needs, so no new index.
        const pendientesQuery = query(
          collection(firestore, 'pendientes'),
          where('household_id', '==', input.householdId),
          where('status', '==', 'paid'),
          where('due_date', '>=', toFirestorePendienteDate(input.monthStart)),
          where('due_date', '<=', toFirestorePendienteDate(input.monthEnd)),
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
          // Hoisted out of the transaction callback deliberately: the
          // callback is re-run on contention, and a ref minted inside it
          // would take a different id on each attempt, so the id written
          // could drift from the one returned to the caller.
          const expenseRef = doc(collection(firestore, 'expenses'))
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
                pendienteId: input.pendienteId,
                // A "Servicio" is a *recurring* bill, not merely one that
                // was tracked as a Pendiente before being paid. A one-off
                // (an Osde payment logged so it would not be forgotten)
                // becomes an ordinary Gasto the moment it is paid. Recorded
                // here, at payment, because the Expense cannot look up a
                // Pendiente that may later be edited or deleted. Per direct
                // feedback.
                isService: current.recurring,
                subcategory: null,
                currency: DEFAULT_CURRENCY,
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

            // A recurring pendiente does not spawn next month's copy here:
            // carrying bills over is a deliberate step ("Pasar recurrentes"
            // on Servicios), per direct feedback -- doing it on every payment
            // doubled a bill whenever a payment was undone and redone.
            return {
              pendiente: {
                ...current,
                status: 'paid' as const,
                paidExpenseId: expenseRef.id,
                paidAt: input.paymentDate,
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
                pendienteId: input.pendienteId,
                // A "Servicio" is a *recurring* bill, not merely one that
                // was tracked as a Pendiente before being paid. A one-off
                // (an Osde payment logged so it would not be forgotten)
                // becomes an ordinary Gasto the moment it is paid. Recorded
                // here, at payment, because the Expense cannot look up a
                // Pendiente that may later be edited or deleted. Per direct
                // feedback.
                isService: current.recurring,
                subcategory: null,
                currency: DEFAULT_CURRENCY,
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
    async unmarkPendientePaid(input) {
      return withHouseholdAccess(
        'unmarkPendientePaid',
        async () => {
          const pendienteRef = doc(firestore, 'pendientes', input.pendienteId)

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
            // Re-check against this fresh read (not just the domain layer's
            // earlier getPendiente) so a pendiente that was, say, deleted or
            // unmarked by someone else between that check and this write
            // surfaces cleanly instead of a generic rules-level denial.
            if (current.status !== 'paid') {
              throw new PendienteNotPaidError()
            }

            // Every Expense the payment created (a Resumen's: one per
            // cuota plus the ajuste) is deleted outright, not just unlinked
            // -- it only exists because of this payment, so once the
            // payment is undone there is nothing left for it to represent.
            // isValidExpenseUpdate never allows pendiente_id to move (see
            // firestore.rules), so these ids can't have drifted onto an
            // unrelated Expense since they were written.
            const paidExpenseIds =
              current.paidExpenseIds ??
              (current.paidExpenseId === null ? [] : [current.paidExpenseId])
            for (const expenseId of paidExpenseIds) {
              tx.delete(doc(firestore, 'expenses', expenseId))
            }
            const isResumen = current.cardId !== undefined
            tx.update(pendienteRef, {
              status: 'pending',
              paid_expense_id: null,
              paid_at: null,
              ...(isResumen ? { paid_expense_ids: [] } : {}),
            })
            // A Resumen's purchases unlock (unless another paid Resumen
            // still holds one of their cuotas).
            for (const purchaseId of isResumen
              ? (current.purchaseIds ?? [])
              : []) {
              tx.update(doc(firestore, 'card_purchases', purchaseId), {
                paid_resumen_ids: arrayRemove(current.id),
              })
            }

            return {
              ...current,
              status: 'pending' as const,
              paidExpenseId: null,
              paidAt: null,
              ...(isResumen ? { paidExpenseIds: [] } : {}),
            }
          })
        },
        {
          pendienteId: input.pendienteId,
          householdId: input.householdId,
        },
      )
    },
    async markResumenPaid(input) {
      return withHouseholdAccess(
        'markResumenPaid',
        async () => {
          const memberId = await awaitAuthenticatedUserId(firestore)
          const resumenRef = doc(firestore, 'pendientes', input.resumenId)
          const now = Timestamp.now()
          const createdAt = now.toDate()

          return runTransaction(firestore, async (tx) => {
            const resumenSnap = await tx.get(resumenRef)
            if (
              !resumenSnap.exists() ||
              resumenSnap.data().household_id !== input.householdId
            ) {
              throw new PendienteNotFoundError()
            }
            const resumen = parsePendienteDocument({
              id: resumenSnap.id,
              data: resumenSnap.data(),
            })
            if (resumen.cardId === undefined) {
              throw new PendienteNotFoundError()
            }
            if (resumen.status !== 'pending') {
              throw new ResumenAlreadyPaidError(
                resumen.name,
                resumenMonthStart(resumen),
              )
            }
            // Every read before any write, as transactions require.
            const purchases = await Promise.all(
              (resumen.purchaseIds ?? []).map(async (id) => {
                const snap = await tx.get(doc(firestore, 'card_purchases', id))
                if (!snap.exists()) {
                  throw new CardPurchaseNotFoundError()
                }
                return parseCardPurchaseDocument({
                  id: snap.id,
                  data: snap.data(),
                })
              }),
            )
            const categoryIds = [
              ...new Set(purchases.map((purchase) => purchase.categoryId)),
            ]
            const categorySnaps = await Promise.all(
              categoryIds.map((id) => tx.get(doc(firestore, 'categories', id))),
            )
            const categoryNameById = new Map(
              categorySnaps.flatMap((snap) =>
                snap.exists()
                  ? [
                      [
                        snap.id,
                        parseCategoryDocument({
                          id: snap.id,
                          data: snap.data(),
                        }).name,
                      ] as const,
                    ]
                  : [],
              ),
            )
            const payment = resumenPayment({
              resumen,
              purchases,
              categoryNameById,
              amountPaid: input.amountPaid,
              paymentDate: input.paymentDate,
            })

            // Minted per attempt: only the committed attempt's ids are
            // written, and those are the ones returned.
            const expenses = payment.expenses.map((line): Expense => ({
              currency: input.currency,
              id: doc(collection(firestore, 'expenses')).id,
              householdId: input.householdId,
              categoryId: input.tarjetaCategoryId,
              memberId,
              authorDisplayName: input.authorDisplayName,
              name: line.name,
              price: line.price,
              comments: '',
              expenseDate: payment.expenseDate,
              pendienteId: resumen.id,
              isService: false,
              subcategory: line.subcategory,
              createdAt,
            }))
            for (const expense of expenses) {
              tx.set(doc(firestore, 'expenses', expense.id), {
                ...expenseToDocument(expense),
                expense_date: toFirestoreExpenseDate(expense.expenseDate),
                created_at: now,
              })
            }
            const paidExpenseIds = expenses.map((expense) => expense.id)
            tx.update(resumenRef, {
              status: 'paid',
              paid_expense_id: paidExpenseIds[0] ?? null,
              paid_expense_ids: paidExpenseIds,
              paid_at: toFirestorePendienteDate(input.paymentDate),
            })
            // Locks each purchase (rules check this Resumen is paid by the
            // end of the commit).
            for (const purchase of purchases) {
              tx.update(doc(firestore, 'card_purchases', purchase.id), {
                paid_resumen_ids: [...purchase.paidResumenIds, resumen.id],
              })
            }

            return {
              pendiente: {
                ...resumen,
                status: 'paid' as const,
                paidExpenseId: paidExpenseIds[0] ?? null,
                paidExpenseIds,
                paidAt: input.paymentDate,
              },
              expenses,
            }
          })
        },
        { resumenId: input.resumenId, householdId: input.householdId },
      )
    },
    async listCards(input) {
      return withHouseholdAccess(
        'listCards',
        async () => {
          const snap = await getDocs(
            query(
              collection(firestore, 'cards'),
              where('household_id', '==', input.householdId),
            ),
          )
          return snap.docs.map((cardDoc) =>
            parseCardDocument({ id: cardDoc.id, data: cardDoc.data() }),
          )
        },
        { householdId: input.householdId },
      )
    },
    async createCard(input) {
      return withHouseholdAccess(
        'createCard',
        async () => {
          const cardRef = doc(collection(firestore, 'cards'))
          const now = Timestamp.now()
          await setDoc(cardRef, {
            household_id: input.householdId,
            name: input.name,
            currency: input.currency,
            created_at: now,
          })
          return {
            id: cardRef.id,
            householdId: input.householdId,
            name: input.name,
            currency: input.currency,
            createdAt: now.toDate(),
          }
        },
        { householdId: input.householdId },
      )
    },
    async updateCardCurrency(input) {
      return withHouseholdAccess(
        'updateCardCurrency',
        async () => {
          const cardRef = doc(firestore, 'cards', input.cardId)
          const snap = await getDoc(cardRef)
          if (
            !snap.exists() ||
            snap.data().household_id !== input.householdId
          ) {
            throw new CardNotFoundError()
          }
          await updateDoc(cardRef, { currency: input.currency })
          return {
            ...parseCardDocument({ id: snap.id, data: snap.data() }),
            currency: input.currency,
          }
        },
        { householdId: input.householdId, cardId: input.cardId },
      )
    },
    async renameCard(input) {
      return withHouseholdAccess(
        'renameCard',
        async () => {
          const cardRef = doc(firestore, 'cards', input.cardId)
          const cardSnap = await getDoc(cardRef)
          if (
            !cardSnap.exists() ||
            cardSnap.data().household_id !== input.householdId
          ) {
            throw new CardNotFoundError()
          }
          const resumenes = await getDocs(
            query(
              collection(firestore, 'pendientes'),
              where('household_id', '==', input.householdId),
              where('card_id', '==', input.cardId),
            ),
          )
          // ponytail: one batch caps at 500 writes, i.e. ~41 years of
          // monthly Resúmenes for one card. A Resumen created between the
          // query and the commit keeps the old name; a transaction can't
          // query, so retry the rename if that ever bites.
          const batch = writeBatch(firestore)
          batch.update(cardRef, { name: input.name })
          for (const resumen of resumenes.docs) {
            batch.update(resumen.ref, { name: input.name })
          }
          await batch.commit()
          return {
            ...parseCardDocument({ id: cardSnap.id, data: cardSnap.data() }),
            name: input.name,
          }
        },
        { householdId: input.householdId },
      )
    },
    async createCardPurchase(input) {
      return withHouseholdAccess(
        'createCardPurchase',
        async () => {
          const memberId = await awaitAuthenticatedUserId(firestore)
          // Minted outside the callback so a retried transaction keeps one id.
          const purchaseRef = doc(collection(firestore, 'card_purchases'))
          const cardRef = doc(firestore, 'cards', input.cardId)
          const now = Timestamp.now()
          const createdAt = now.toDate()
          const cuotas = cuotasOf(input).map((cuota) => ({
            ...cuota,
            ref: doc(
              firestore,
              'pendientes',
              resumenIdFor(input.cardId, cuota.monthStart, input.currency),
            ),
          }))

          return runTransaction(firestore, async (tx) => {
            const cardSnap = await tx.get(cardRef)
            if (
              !cardSnap.exists() ||
              cardSnap.data().household_id !== input.householdId
            ) {
              throw new CardNotFoundError()
            }
            const card = parseCardDocument({
              id: cardSnap.id,
              data: cardSnap.data(),
            })
            // Every read before any write, as transactions require.
            const resumenSnaps = await Promise.all(
              cuotas.map((cuota) => tx.get(cuota.ref)),
            )
            const existing = resumenSnaps.map((snap) =>
              snap.exists()
                ? parsePendienteDocument({ id: snap.id, data: snap.data() })
                : null,
            )
            cuotas.forEach((cuota, index) => {
              if (existing[index]?.status === 'paid') {
                throw new ResumenAlreadyPaidError(card.name, cuota.monthStart)
              }
            })

            tx.set(purchaseRef, {
              household_id: input.householdId,
              card_id: input.cardId,
              category_id: input.categoryId,
              member_id: memberId,
              author_display_name: input.authorDisplayName,
              name: input.name,
              total: input.total,
              cuotas: input.cuotas,
              // Midday, like expense_date: a local-midnight instant reads as
              // the previous day (and month) for a member further west.
              purchase_date: toFirestoreExpenseDate(input.purchaseDate),
              comments: input.comments,
              currency: input.currency,
              created_at: now,
            })
            cuotas.forEach((cuota, index) => {
              const resumen = existing[index]
              if (resumen !== null && resumen !== undefined) {
                tx.update(cuota.ref, {
                  expected_amount:
                    Math.round(
                      ((resumen.expectedAmount ?? 0) + cuota.amount) * 100,
                    ) / 100,
                  purchase_ids: [
                    ...(resumen.purchaseIds ?? []),
                    purchaseRef.id,
                  ],
                })
                return
              }
              tx.set(
                cuota.ref,
                newResumenDocument({
                  householdId: input.householdId,
                  resumenCategoryId: input.resumenCategoryId,
                  cardId: input.cardId,
                  cardName: card.name,
                  monthStart: cuota.monthStart,
                  amount: cuota.amount,
                  purchaseId: purchaseRef.id,
                  currency: input.currency,
                  now,
                }),
              )
            })

            return {
              id: purchaseRef.id,
              householdId: input.householdId,
              cardId: input.cardId,
              categoryId: input.categoryId,
              memberId,
              authorDisplayName: input.authorDisplayName,
              name: input.name,
              total: input.total,
              cuotas: input.cuotas,
              purchaseDate: input.purchaseDate,
              comments: input.comments,
              currency: input.currency,
              createdAt,
              paidResumenIds: [],
            }
          })
        },
        { householdId: input.householdId, cardId: input.cardId },
      )
    },
    async updateCardPurchase(input) {
      return withHouseholdAccess(
        'updateCardPurchase',
        async () => {
          const purchaseRef = doc(firestore, 'card_purchases', input.purchaseId)
          return runTransaction(firestore, async (tx) => {
            const cardSnap = await tx.get(doc(firestore, 'cards', input.cardId))
            if (
              !cardSnap.exists() ||
              cardSnap.data().household_id !== input.householdId
            ) {
              throw new CardNotFoundError()
            }
            const cardName = parseCardDocument({
              id: cardSnap.id,
              data: cardSnap.data(),
            }).name
            const edited = await moveCardPurchaseCuotas({
              firestore,
              tx,
              householdId: input.householdId,
              purchaseId: input.purchaseId,
              after: (before) => ({
                purchase: {
                  ...before,
                  cardId: input.cardId,
                  categoryId: input.categoryId,
                  name: input.name,
                  total: input.total,
                  cuotas: input.cuotas,
                  purchaseDate: input.purchaseDate,
                  comments: input.comments,
                  currency: input.currency,
                },
                cardName,
                resumenCategoryId: input.resumenCategoryId,
              }),
            })
            // Only a delete has no purchase after; narrows the type.
            if (edited === null) {
              throw new CardPurchaseNotFoundError()
            }
            // member_id, author and created_at stay the original author's.
            tx.update(purchaseRef, {
              card_id: input.cardId,
              category_id: input.categoryId,
              name: input.name,
              total: input.total,
              cuotas: input.cuotas,
              purchase_date: toFirestoreExpenseDate(input.purchaseDate),
              comments: input.comments,
              currency: input.currency,
            })
            return edited
          })
        },
        { householdId: input.householdId, purchaseId: input.purchaseId },
      )
    },
    async deleteCardPurchase(input) {
      return withHouseholdAccess(
        'deleteCardPurchase',
        async () => {
          await runTransaction(firestore, async (tx) => {
            await moveCardPurchaseCuotas({
              firestore,
              tx,
              householdId: input.householdId,
              purchaseId: input.purchaseId,
              after: () => null,
            })
            tx.delete(doc(firestore, 'card_purchases', input.purchaseId))
          })
        },
        { householdId: input.householdId, purchaseId: input.purchaseId },
      )
    },
    async listCardPurchasesInMonth(input) {
      return withHouseholdAccess(
        'listCardPurchasesInMonth',
        async () => {
          const snap = await getDocs(
            query(
              collection(firestore, 'card_purchases'),
              where('household_id', '==', input.householdId),
              where(
                'purchase_date',
                '>=',
                Timestamp.fromDate(input.monthStart),
              ),
              where('purchase_date', '<=', Timestamp.fromDate(input.monthEnd)),
              orderBy('purchase_date', 'desc'),
            ),
          )
          return snap.docs.map((purchaseDoc) =>
            parseCardPurchaseDocument({
              id: purchaseDoc.id,
              data: purchaseDoc.data(),
            }),
          )
        },
        { householdId: input.householdId },
      )
    },
    async getCardPurchases(input) {
      return withHouseholdAccess(
        'getCardPurchases',
        async () => {
          // One get per id: a Resumen holds a handful of purchases, and the
          // rules allow reading each one the household owns.
          // Rules deny reading a missing or foreign id, so one bad id in
          // purchase_ids is skipped rather than failing the whole Resumen.
          const results = await Promise.allSettled(
            input.purchaseIds.map((id) =>
              getDoc(doc(firestore, 'card_purchases', id)),
            ),
          )
          return results.flatMap((result) => {
            if (result.status === 'rejected') {
              if (isFirestorePermissionDenied(result.reason)) {
                return []
              }
              throw result.reason
            }
            const snap = result.value
            return snap.exists() &&
              snap.data().household_id === input.householdId
              ? [parseCardPurchaseDocument({ id: snap.id, data: snap.data() })]
              : []
          })
        },
        { householdId: input.householdId },
      )
    },
  }
}

import type { Currency } from '@/lib/money'
import type { HouseholdsDb } from '@/lib/households/types'
import type { ExpenseHistoryCursor, ExpenseHistoryPage } from './history'
import type { Category, Expense } from './types'
import {
  parseAuthorDisplayName,
  parseCategoryName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
} from './validate'

export class ExpenseNotFoundError extends Error {
  override readonly name = 'ExpenseNotFoundError'
  readonly code = 'EXPENSE_NOT_FOUND'

  constructor() {
    super('Expense not found')
  }
}

export async function listCategories(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Category[]> {
  return input.db.listCategories(input.householdId)
}

export async function findOrCreateCategory(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly name: string
}): Promise<Category> {
  return input.db.findOrCreateCategory({
    householdId: input.householdId,
    name: parseCategoryName(input.name),
  })
}

export async function createExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly name: string
  readonly price: number
  readonly comments: string
  readonly expenseDate: Date
  // Pesos when omitted. A dollar gasto is recorded and shown but never
  // counted -- see lib/money/currency.
  readonly currency?: Currency
  // Which of the household's payment methods paid for it. Omitted for
  // cash, the one method every household has without writing it down.
  readonly paymentMethodId?: string | null
}): Promise<Expense> {
  return input.db.createExpense({
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    ...(input.paymentMethodId === undefined
      ? {}
      : { paymentMethodId: input.paymentMethodId }),
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: input.memberId,
    authorDisplayName: parseAuthorDisplayName(input.authorDisplayName),
    name: parseExpenseName(input.name),
    price: parseExpensePrice(input.price),
    comments: input.comments,
    expenseDate: parseExpenseDate(input.expenseDate),
  })
}

// Every expense the household has, newest first. Only the search needs it;
// every other view reads a month. See the db interface for why this is one
// query rather than a walk through paged history.
export async function listAllExpenses(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Expense[]> {
  return input.db.listAllExpenses({ householdId: input.householdId })
}

export async function listExpensesInMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}): Promise<readonly Expense[]> {
  return input.db.listExpensesInMonth({
    householdId: input.householdId,
    monthStart: input.monthStart,
    monthEnd: input.monthEnd,
  })
}

export async function listRecentExpenses(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly limit: number
}): Promise<readonly Expense[]> {
  return input.db.listRecentExpenses({
    householdId: input.householdId,
    limit: input.limit,
  })
}

export async function listExpenseHistoryPage(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly after?: ExpenseHistoryCursor
}): Promise<ExpenseHistoryPage> {
  return input.db.listExpenseHistoryPage({
    householdId: input.householdId,
    ...(input.after === undefined ? {} : { after: input.after }),
  })
}

export async function updateExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly expenseId: string
  readonly name?: string
  readonly price?: number
  readonly categoryId?: string
  readonly comments?: string
  readonly expenseDate?: Date
  // Reassigns which member this Expense is attributed to -- both or
  // neither, since a mismatched pair (a memberId with the wrong name)
  // isn't a state any real household member picker could produce.
  readonly memberId?: string
  readonly authorDisplayName?: string
  // A manual "count this as a servicio" override -- only meaningful (and
  // only ever offered by the edit form) when the Expense isn't already
  // linked to a real Pendiente via pendienteId.
  readonly isService?: boolean
  // What a gasto is in and what paid for it. Picked at the moment it is
  // logged -- which is exactly when they are easiest to get wrong -- so both
  // are correctable here rather than by deleting and re-adding.
  readonly currency?: Currency
  readonly paymentMethodId?: string | null
  readonly now?: Date
}): Promise<Expense> {
  const now = input.now ?? new Date()
  const existing = await input.db.getExpense({
    householdId: input.householdId,
    expenseId: input.expenseId,
  })
  if (existing === null) {
    throw new ExpenseNotFoundError()
  }

  const name =
    input.name !== undefined ? parseExpenseName(input.name) : existing.name
  const price =
    input.price !== undefined ? parseExpensePrice(input.price) : existing.price
  const comments =
    input.comments !== undefined ? input.comments : existing.comments
  const categoryId = input.categoryId ?? existing.categoryId
  // Any month, not just the current one: Histórico lets a member open an
  // expense from any month, so both the expense being edited and the date it
  // is moved to are unrestricted. Future dates are still rejected, by the
  // same rule that governs creating one.
  const expenseDate =
    input.expenseDate !== undefined
      ? parseExpenseDate(input.expenseDate, now)
      : existing.expenseDate
  const memberId = input.memberId ?? existing.memberId
  const authorDisplayName =
    input.authorDisplayName !== undefined
      ? parseAuthorDisplayName(input.authorDisplayName)
      : existing.authorDisplayName
  const isService = input.isService ?? existing.isService
  const currency = input.currency ?? existing.currency
  // `?? existing` would read a deliberate null as "leave it alone", and
  // null is the real value for cash -- the method every household has
  // without writing it down. Only an absent key means "unchanged".
  const paymentMethodId =
    input.paymentMethodId !== undefined
      ? input.paymentMethodId
      : existing.paymentMethodId

  return input.db.updateExpense({
    householdId: input.householdId,
    expenseId: input.expenseId,
    categoryId,
    name,
    price,
    comments,
    expenseDate,
    memberId,
    authorDisplayName,
    isService,
    currency,
    paymentMethodId,
  })
}

export async function deleteExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly expenseId: string
}): Promise<void> {
  return input.db.deleteExpense({
    householdId: input.householdId,
    expenseId: input.expenseId,
  })
}

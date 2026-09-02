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
}): Promise<Expense> {
  return input.db.createExpense({
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

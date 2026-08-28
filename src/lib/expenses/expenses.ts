import type { HouseholdsDb } from '@/lib/households/types'
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

export async function updateExpense(input: {
  readonly db: HouseholdsDb
  readonly expenseId: string
  readonly householdId: string
  readonly name: string
  readonly price: number
  readonly categoryId: string
  readonly comments: string
  readonly expenseDate: Date
}): Promise<Expense> {
  return input.db.updateExpense({
    expenseId: input.expenseId,
    householdId: input.householdId,
    name: parseExpenseName(input.name),
    price: parseExpensePrice(input.price),
    categoryId: input.categoryId,
    comments: input.comments,
    expenseDate: parseExpenseDate(input.expenseDate),
  })
}

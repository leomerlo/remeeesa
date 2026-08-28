import type { HouseholdsDb } from '@/lib/households/types'
import type { Category, Expense } from './types'
import {
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
} from './validate'

export async function listCategories(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Category[]> {
  return input.db.listCategories(input.householdId)
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

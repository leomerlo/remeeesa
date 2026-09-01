import { colorForCategoryName } from './categoryColor'
import type { Category, Expense } from './types'

export type CategorySummary = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  readonly total: number
}

export type PersonSummary = {
  readonly authorDisplayName: string
  readonly total: number
}

const UNKNOWN_CATEGORY_NAME = 'Categoría desconocida'

// Groups expenses by categoryId and sums their price. An expense whose
// categoryId has no matching entry in `categories` (e.g. the category was
// deleted after the expense was recorded) falls back to the same
// colorForCategoryName hashing RecentExpensesList.tsx already uses for unknown
// categories, keeping the swatch deterministic instead of blank.
//
// Sort is descending by total; Array#prototype.sort is stable, so a tie
// keeps the order in which each category's first expense was encountered
// in the input array.
export function summarizeByCategory(input: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
}): readonly CategorySummary[] {
  const categoryById = new Map(
    input.categories.map((category) => [category.id, category]),
  )
  const totals = new Map<
    string,
    { name: string; color: string; total: number }
  >()

  for (const expense of input.expenses) {
    const category = categoryById.get(expense.categoryId)
    const name = category?.name ?? UNKNOWN_CATEGORY_NAME
    const color = category?.color ?? colorForCategoryName(name)
    const existing = totals.get(expense.categoryId)
    if (existing === undefined) {
      totals.set(expense.categoryId, { name, color, total: expense.price })
    } else {
      existing.total += expense.price
    }
  }

  return Array.from(totals.entries())
    .map(([categoryId, entry]) => ({ categoryId, ...entry }))
    .sort((left, right) => right.total - left.total)
}

// Groups expenses by the snapshotted authorDisplayName and sums their
// price. Sort is descending by total, stable for ties (see
// summarizeByCategory).
export function summarizeByPerson(input: {
  readonly expenses: readonly Expense[]
}): readonly PersonSummary[] {
  const totals = new Map<string, number>()

  for (const expense of input.expenses) {
    const existing = totals.get(expense.authorDisplayName)
    totals.set(
      expense.authorDisplayName,
      (existing ?? 0) + expense.price,
    )
  }

  return Array.from(totals.entries())
    .map(([authorDisplayName, total]) => ({ authorDisplayName, total }))
    .sort((left, right) => right.total - left.total)
}

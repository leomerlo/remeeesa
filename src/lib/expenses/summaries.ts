import { colorForCategoryName } from './categoryColor'
import type { Category, Expense } from './types'

export type CategorySummary = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  readonly total: number
  // Fraction of the period's total spend, 0..1. Computed here rather than in
  // the chart so the number the chart draws and the number the list prints
  // can never disagree.
  readonly share: number
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

  // Guard the divide: a period with no expenses (or, defensively, one whose
  // prices sum to 0) yields shares of 0 rather than NaN reaching the chart's
  // geometry, where it would silently render nothing.
  let grandTotal = 0
  for (const entry of totals.values()) {
    grandTotal += entry.total
  }

  return Array.from(totals.entries())
    .map(([categoryId, entry]) => ({
      categoryId,
      ...entry,
      share: grandTotal > 0 ? entry.total / grandTotal : 0,
    }))
    .sort((left, right) => right.total - left.total)
}

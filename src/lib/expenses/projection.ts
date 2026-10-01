import type { Expense } from './types'

export type ProjectionRow = {
  readonly categoryId: string
  readonly price: number
  // 'actual' is already spent this month in the category; 'projected' is
  // carried over from last month because the category has nothing yet.
  readonly source: 'actual' | 'projected'
}

function totalsByCategory(expenses: readonly Expense[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const expense of expenses) {
    totals.set(
      expense.categoryId,
      (totals.get(expense.categoryId) ?? 0) + expense.price,
    )
  }
  return totals
}

// Per category: this month's total when it has any expense, otherwise last
// month's total.
export function buildProjection(
  previous: readonly Expense[],
  current: readonly Expense[],
): readonly ProjectionRow[] {
  const now = totalsByCategory(current)
  const before = totalsByCategory(previous)
  const rows: ProjectionRow[] = [...now].map(([categoryId, price]) => ({
    categoryId,
    price,
    source: 'actual',
  }))
  for (const [categoryId, price] of before) {
    if (!now.has(categoryId)) {
      rows.push({ categoryId, price, source: 'projected' })
    }
  }
  return rows
}

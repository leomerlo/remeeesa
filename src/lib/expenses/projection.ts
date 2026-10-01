import { isServicio } from './servicio'
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

const normalize = (name: string): string => name.trim().toLowerCase()

// Per category: this month's total when it has any expense, otherwise last
// month's total. A servicio of last month that also exists in the active month
// (`activeServicioNames`: its own pending bill or a paid one) is left out of
// the carry-over, so a recurring bill counts once, at this month's amount.
export function buildProjection(
  previous: readonly Expense[],
  current: readonly Expense[],
  activeServicioNames: readonly string[] = [],
): readonly ProjectionRow[] {
  const active = new Set([
    ...activeServicioNames.map(normalize),
    ...current.filter(isServicio).map((e) => normalize(e.name)),
  ])
  const now = totalsByCategory(current)
  const before = totalsByCategory(
    previous.filter((e) => !(isServicio(e) && active.has(normalize(e.name)))),
  )
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

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

// Accents folded too: "Tarjeta de crédito" and "Tarjeta de credito" are the
// same bill to whoever typed them.
const normalize = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()

// Paid through Servicios (pendienteId) or flagged by hand (isService): either
// way it is a bill, not a one-off gasto.
const isBill = (expense: Expense): boolean =>
  isServicio(expense) || expense.pendienteId !== null

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
    ...current.filter(isBill).map((e) => normalize(e.name)),
  ])
  const now = totalsByCategory(current)
  const before = totalsByCategory(
    previous.filter((e) => !(isBill(e) && active.has(normalize(e.name)))),
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

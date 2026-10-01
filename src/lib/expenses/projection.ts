import type { Expense } from './types'

export type ProjectionRow = {
  readonly key: string
  readonly name: string
  readonly price: number
  // 'actual' is already logged this month; 'projected' is carried over from
  // last month because nothing with that name has shown up yet.
  readonly source: 'actual' | 'projected'
}

const normalize = (name: string): string => name.trim().toLowerCase()

// This month's expenses stand as they are; last month's fill in only the ones
// not yet seen this month, matched by name. Each current expense consumes one
// previous match, so two "Café" last month and one so far leaves one projected.
export function buildProjection(
  previous: readonly Expense[],
  current: readonly Expense[],
): readonly ProjectionRow[] {
  const seen = new Map<string, number>()
  for (const expense of current) {
    const name = normalize(expense.name)
    seen.set(name, (seen.get(name) ?? 0) + 1)
  }
  const rows: ProjectionRow[] = current.map((expense) => ({
    key: `actual-${expense.id}`,
    name: expense.name,
    price: expense.price,
    source: 'actual',
  }))
  for (const expense of previous) {
    const name = normalize(expense.name)
    const left = seen.get(name) ?? 0
    if (left > 0) {
      seen.set(name, left - 1)
    } else {
      rows.push({
        key: `projected-${expense.id}`,
        name: expense.name,
        price: expense.price,
        source: 'projected',
      })
    }
  }
  return rows
}

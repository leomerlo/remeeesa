import type { Household } from './types'

// "2026-09". Sorts lexicographically in calendar order, which is the whole
// reason for the shape -- finding the snapshot in force for a month is a
// string comparison rather than date arithmetic.
export function monthKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

// The budget a month was actually run on.
//
// A household's budget is not one number that applies to all of history: it
// is what the household decided it could spend *that* month, given the
// bills it had then. Raising it in October must not quietly rewrite what
// September was measured against. Per direct feedback: "si yo actualizo el
// presu, queda fijo para ese mes, y los meses pasados quedan con el
// presupuesto que se le puso en ese momento."
//
// So each month that had one set carries its own figure, and a month with
// none inherits the last one set before it -- leaving the budget alone
// simply means it carries on unchanged, which is the common case. A month
// earlier than every snapshot takes the earliest one rather than today's
// figure: it is the oldest thing the household ever said, and unlike
// today's figure it does not move when the budget is edited now.
//
// `monthlyBudget` on the household is the fallback for a household with no
// snapshots at all -- every one of them, until this field existed.
export function monthlyBudgetFor(household: Household, month: Date): number {
  const keys = Object.keys(household.monthlyBudgets).sort()
  if (keys.length === 0) {
    return household.monthlyBudget
  }
  const target = monthKey(month)
  let inForce: string | undefined
  for (const key of keys) {
    if (key <= target) {
      inForce = key
    }
  }
  // Before the household ever set one: the earliest it ever said.
  const chosen = inForce ?? keys[0]
  return household.monthlyBudgets[chosen as string] ?? household.monthlyBudget
}

// The snapshots with this month's figure written in, ready to store. Used
// when the budget is edited: the month being edited gets its own entry and
// every other month is left exactly as it was.
export function withMonthlyBudgetFor(input: {
  readonly household: Household
  readonly month: Date
  readonly monthlyBudget: number
}): Readonly<Record<string, number>> {
  return {
    ...input.household.monthlyBudgets,
    [monthKey(input.month)]: input.monthlyBudget,
  }
}

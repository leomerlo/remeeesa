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
// So each month that had one set carries its own figure. A month earlier
// than every snapshot takes the earliest one rather than today's figure:
// it is the oldest thing the household ever said, and unlike today's it
// does not move when the budget is edited now.
//
// A month in the *past* with none of its own inherits the last one set
// before it: that is the number it was actually lived and measured
// against, and rewriting it to nothing would make a month the household
// already reconciled read as if it had never had a budget.
//
// From the current month on, nothing is inherited. A new month opens with
// no budget and says so, because what last month could afford is not a
// decision anybody has made about this one -- and the household works the
// other way round, looking at what is already in use and at Proyecciones
// before settling on a figure. Zero is how the app has always spelled "no
// budget" (see parseMonthlyBudget), and the card that reads it offers the
// form rather than counting down from nothing. Per direct feedback: me
// gustaría que esté la opción de todavía no cargaste un presupuesto para
// noviembre, cargalo.
//
// `monthlyBudget` on the household is the fallback for a household with no
// snapshots at all -- every one of them, until this field existed.
export function monthlyBudgetFor(
  household: Household,
  month: Date,
  now: Date = new Date(),
): number {
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
  if (inForce === undefined) {
    // Before the household ever set one: the earliest it ever said.
    return (
      household.monthlyBudgets[keys[0] as string] ?? household.monthlyBudget
    )
  }
  // Its own figure, whatever month it is.
  if (inForce === target) {
    return household.monthlyBudgets[inForce] ?? household.monthlyBudget
  }
  // Inherited -- allowed only for a month that is already over.
  return target < monthKey(now)
    ? (household.monthlyBudgets[inForce] ?? household.monthlyBudget)
    : 0
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

// Every month the household could sensibly have a budget for: from the one
// it was created in through next month, newest first. Next month is
// included so the budget can be set before the month starts -- which is
// when a household that plans actually sets it.
export function budgetableMonths(input: {
  readonly household: Household
  readonly now?: Date
}): readonly Date[] {
  const now = input.now ?? new Date()
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  // A snapshot older than the household's own createdAt should still be
  // reachable: it is a month someone deliberately set.
  const earliestKey = Object.keys(input.household.monthlyBudgets).sort()[0]
  const createdMonth = new Date(
    input.household.createdAt.getFullYear(),
    input.household.createdAt.getMonth(),
    1,
  )
  const first =
    earliestKey === undefined
      ? createdMonth
      : new Date(
          Math.min(
            createdMonth.getTime(),
            new Date(
              Number(earliestKey.slice(0, 4)),
              Number(earliestKey.slice(5, 7)) - 1,
              1,
            ).getTime(),
          ),
        )

  const months: Date[] = []
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1)
  // Guarded: a corrupt createdAt must not spin here.
  while (cursor <= last && months.length < 240) {
    months.push(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months.reverse()
}

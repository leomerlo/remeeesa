import type { Expense } from './types'

export type ExpenseHistoryPage = {
  readonly expenses: readonly Expense[]
  readonly nextBeforeMonthStart: Date | null
}

// Local midnight on the 1st of the given date's month.
export function monthStartOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

// Local end-of-day on the last day of the given date's month. Day 0 of the
// following month is the last day of this one -- the same idiom
// currentMonthRange uses.
export function monthEndOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

// Turns a newest-first list of a household's expenses into one page: every
// expense belonging to the newest calendar month present, and nothing else.
//
// A page is a whole month rather than a fixed row count, which is what makes
// "no page splits a month" true by construction instead of by trimming --
// the Histórico screen can render a month header knowing nothing more will
// arrive under it later. A month with an unusual number of expenses simply
// produces a bigger page; it is never cut in half.
//
// `sortedDesc` must already exclude anything at or after the caller's cursor
// and be sorted newest-first. `hasOlder` says whether anything exists
// strictly before the returned month, which the caller knows more cheaply
// than this function could work out.
export function buildExpenseHistoryPage(
  sortedDesc: readonly Expense[],
  hasOlder: (monthStart: Date) => boolean,
): ExpenseHistoryPage {
  const newest = sortedDesc[0]
  if (newest === undefined) {
    return { expenses: [], nextBeforeMonthStart: null }
  }

  const pageMonthStart = monthStartOf(newest.expenseDate)
  const expenses = sortedDesc.filter(
    (expense) => expense.expenseDate.getTime() >= pageMonthStart.getTime(),
  )

  return {
    expenses,
    nextBeforeMonthStart: hasOlder(pageMonthStart) ? pageMonthStart : null,
  }
}

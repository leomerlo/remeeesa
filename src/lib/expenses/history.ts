import type { Expense } from './types'

// A fixed row count, not a calendar month: Histórico's "Cargar más" used to
// load one whole month at a time, which meant a light month (a couple of
// bills) loaded almost nothing while a heavy one (daily coffees) loaded
// dozens of rows in a single tap. Same page size regardless of what month
// the data happens to fall in.
export const EXPENSE_HISTORY_PAGE_SIZE = 15

// The last expense of a page, by its own sort keys -- Firestore's
// `startAfter` cursor for the `expense_date desc, created_at desc` index
// every expense query already uses. `createdAt` breaks ties on the same
// `expenseDate`; without it, a page boundary landing between two same-date
// expenses could skip or repeat one.
export type ExpenseHistoryCursor = {
  readonly expenseDate: Date
  readonly createdAt: Date
}

export type ExpenseHistoryPage = {
  readonly expenses: readonly Expense[]
  readonly nextCursor: ExpenseHistoryCursor | null
}

// Turns a newest-first list of a household's expenses (already excluding
// anything at or before the caller's cursor) into one fixed-size page.
//
// A page can land mid-month now -- unlike the calendar-month pages this
// replaced, nothing here keeps a month whole. That is fine: Histórico's
// month headers/totals (ExpenseHistory.tsx's groupByMonth) are computed
// from the full accumulated list across every loaded page, not from page
// boundaries, so a month split across two "Cargar más" clicks still
// renders as one section once both pages have loaded.
//
// `sortedDesc` must already exclude anything at or before the caller's
// cursor and be sorted newest-first (expense_date desc, then created_at
// desc to match).
export function buildExpenseHistoryPage(
  sortedDesc: readonly Expense[],
): ExpenseHistoryPage {
  const expenses = sortedDesc.slice(0, EXPENSE_HISTORY_PAGE_SIZE)
  const last = expenses[expenses.length - 1]
  const hasMore = sortedDesc.length > EXPENSE_HISTORY_PAGE_SIZE

  return {
    expenses,
    nextCursor:
      hasMore && last !== undefined
        ? { expenseDate: last.expenseDate, createdAt: last.createdAt }
        : null,
  }
}

import { countedByBudget } from '@/lib/money'
import type { Currency } from '@/lib/money'

// What a household has spent so far this month, beside what it had spent by
// the same point of the month before.
//
// This exists because the beta's Home has no budget to measure against: the
// budget is optional there, and most people will never set one. Without a
// budget the only honest reference a month has is the household's own past,
// and a whole-month total is the wrong one -- on the 4th, "last month:
// $2.100.000" says nothing about whether this month is going well.
// lastNMonthRanges deliberately gives whole calendar months for the trend
// chart; this gives the one partial comparison that figure needs.
export type SpendToDate = {
  // Spent from the 1st through the end of the reference day.
  readonly thisMonth: number
  // Spent from the 1st of the previous month through the same day of it.
  readonly lastMonth: number
  // thisMonth - lastMonth. Positive means this month is the dearer one.
  readonly difference: number
  // Rounded whole percent, or null when the previous month's figure is not
  // a base anything can be divided by -- zero (nothing spent yet, or the
  // household's first month) or negative (a month whose only movement was
  // the negative "ajuste" written when a card Resumen is paid for less than
  // it said). The screen says "el mes pasado no habías gastado nada a esta
  // altura" rather than printing an infinity.
  readonly percentChange: number | null
  // The instant the previous month was cut at. Worth returning because of
  // the clamp below: on the 31st of March this is the 28th of February, and
  // a screen that says "a esta altura" would be lying -- it is the whole of
  // February. The caller can check and word it accordingly.
  readonly comparedThrough: Date
}

function endOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 23, 59, 59, 999)
}

// Day 0 of the following month is the last day of this one.
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

type Counted = {
  readonly price: number
  readonly currency: Currency
  readonly expenseDate: Date
}

// Summed in cents for the same reason computeMonthTotalIn does it: two
// figures that are about to be subtracted from each other must not each
// carry their own floating-point drift.
function sumBetween(
  expenses: readonly Counted[],
  start: Date,
  cutoff: Date,
): number {
  const from = start.getTime()
  const to = cutoff.getTime()
  let cents = 0
  for (const expense of countedByBudget(expenses)) {
    const at = expense.expenseDate.getTime()
    if (at >= from && at <= to) {
      cents += Math.round(expense.price * 100)
    }
  }
  return cents / 100
}

// Expenses only, never Pendientes: a bill that has not been paid has not
// been spent, and carries no date on which it was. A bill that *has* been
// paid is already here, since markPendientePaid writes a real Expense.
//
// Dollars are left out, the same as in every other peso figure -- see
// lib/money/currency for why no rate is picked.
export function computeSpendToDate(
  expenses: readonly Counted[],
  now: Date = new Date(),
): SpendToDate {
  const year = now.getFullYear()
  const month = now.getMonth()
  const day = now.getDate()

  const thisMonthStart = new Date(year, month, 1)
  const thisMonthCutoff = endOfDay(year, month, day)

  // Built from a Date rather than by subtracting one from the month number,
  // so January rolls back into the previous December on its own.
  const lastMonthStart = new Date(year, month - 1, 1)
  const lastYear = lastMonthStart.getFullYear()
  const lastMonthIndex = lastMonthStart.getMonth()
  // The 31st of March has no counterpart in February, so the comparison is
  // cut at the last day the previous month has. Clamping rather than
  // scaling: by the 31st of March the whole of March has been lived, and by
  // the 28th of February so had the whole of February, which makes the two
  // figures comparable in the only way a reader would expect.
  const lastMonthCutoff = endOfDay(
    lastYear,
    lastMonthIndex,
    Math.min(day, daysInMonth(lastYear, lastMonthIndex)),
  )

  const thisMonth = sumBetween(expenses, thisMonthStart, thisMonthCutoff)
  const lastMonth = sumBetween(expenses, lastMonthStart, lastMonthCutoff)
  const difference = Math.round((thisMonth - lastMonth) * 100) / 100

  return {
    thisMonth,
    lastMonth,
    difference,
    percentChange:
      lastMonth > 0 ? Math.round((difference / lastMonth) * 100) : null,
    comparedThrough: lastMonthCutoff,
  }
}

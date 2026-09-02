import { currentMonthRange } from './remainingBudget'

// How many months the Categorías trend chart compares, including the
// current one -- a window short enough to read as bars on a phone screen
// without scrolling, long enough to show an actual trend rather than one or
// two data points.
export const MONTHLY_TOTALS_MONTH_COUNT = 6

export type MonthRange = {
  readonly monthStart: Date
  readonly monthEnd: Date
}

// The given number of calendar months ending with (and including) the month
// containing `now`, oldest first -- e.g. for now = September 2026 and
// count = 6, this returns April through September 2026 in that order, which
// is the order a left-to-right bar chart reads in.
export function lastNMonthRanges(
  count: number,
  now: Date,
): readonly MonthRange[] {
  const ranges: MonthRange[] = []
  for (let monthsAgo = count - 1; monthsAgo >= 0; monthsAgo -= 1) {
    const reference = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1)
    ranges.push(currentMonthRange(reference))
  }
  return ranges
}

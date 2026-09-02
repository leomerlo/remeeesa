import { describe, expect, it } from 'vitest'
import { lastNMonthRanges } from './monthlyTotals'

describe('lastNMonthRanges', () => {
  it('returns the given count of months, oldest first, ending with the reference month', () => {
    const now = new Date(2026, 8, 15) // September 15, 2026
    const ranges = lastNMonthRanges(6, now)

    expect(ranges).toHaveLength(6)
    expect(ranges.map((range) => range.monthStart)).toEqual([
      new Date(2026, 3, 1), // April
      new Date(2026, 4, 1), // May
      new Date(2026, 5, 1), // June
      new Date(2026, 6, 1), // July
      new Date(2026, 7, 1), // August
      new Date(2026, 8, 1), // September (the reference month, last)
    ])
  })

  it('crosses a year boundary correctly', () => {
    const now = new Date(2026, 1, 10) // February 10, 2026
    const ranges = lastNMonthRanges(3, now)

    expect(ranges.map((range) => range.monthStart)).toEqual([
      new Date(2025, 11, 1), // December 2025
      new Date(2026, 0, 1), // January 2026
      new Date(2026, 1, 1), // February 2026
    ])
  })

  it('each range spans the full calendar month, matching currentMonthRange', () => {
    const now = new Date(2026, 8, 15)
    const ranges = lastNMonthRanges(1, now)
    const [range] = ranges
    expect(range).toBeDefined()
    if (range === undefined) {
      throw new Error('expected one range')
    }
    expect(range.monthStart).toEqual(new Date(2026, 8, 1))
    expect(range.monthEnd).toEqual(new Date(2026, 8, 30, 23, 59, 59, 999))
  })

  it('returns an empty array for a count of 0', () => {
    expect(lastNMonthRanges(0, new Date(2026, 8, 15))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { Currency } from '@/lib/money'
import { computeSpendToDate } from './spendToDate'

function gasto(
  price: number,
  expenseDate: Date,
  currency: Currency = 'ARS',
): { price: number; currency: Currency; expenseDate: Date } {
  return { price, currency, expenseDate }
}

describe('computeSpendToDate', () => {
  it('sums each month from its 1st through the same day of the month', () => {
    const now = new Date(2026, 9, 15, 10, 0) // October 15, 2026
    const result = computeSpendToDate(
      [
        gasto(1000, new Date(2026, 9, 3)),
        gasto(500, new Date(2026, 9, 15, 20, 0)), // later today, still counts
        gasto(800, new Date(2026, 8, 3)),
        gasto(200, new Date(2026, 8, 15, 23, 0)),
      ],
      now,
    )

    expect(result.thisMonth).toBe(1500)
    expect(result.lastMonth).toBe(1000)
    expect(result.difference).toBe(500)
    expect(result.percentChange).toBe(50)
  })

  it('ignores what came later in the previous month and later in this one', () => {
    const now = new Date(2026, 9, 15, 10, 0)
    const result = computeSpendToDate(
      [
        gasto(1000, new Date(2026, 9, 15, 23, 59)),
        gasto(9999, new Date(2026, 9, 16)), // tomorrow
        gasto(400, new Date(2026, 8, 15)),
        gasto(7777, new Date(2026, 8, 16)), // past the cutoff last month
        gasto(5555, new Date(2026, 7, 31)), // two months back
      ],
      now,
    )

    expect(result.thisMonth).toBe(1000)
    expect(result.lastMonth).toBe(400)
  })

  it('leaves dollar amounts out of both figures', () => {
    const now = new Date(2026, 9, 15)
    const result = computeSpendToDate(
      [
        gasto(1000, new Date(2026, 9, 2)),
        gasto(120, new Date(2026, 9, 2), 'USD'),
        gasto(900, new Date(2026, 8, 2)),
        gasto(300, new Date(2026, 8, 2), 'USD'),
      ],
      now,
    )

    expect(result.thisMonth).toBe(1000)
    expect(result.lastMonth).toBe(900)
  })

  it('cuts the previous month at its last day when it is shorter', () => {
    const now = new Date(2026, 2, 31, 9, 0) // March 31, 2026; February has 28
    const result = computeSpendToDate(
      [
        gasto(100, new Date(2026, 2, 31, 8, 0)),
        gasto(250, new Date(2026, 1, 28, 22, 0)), // February 28, still counts
      ],
      now,
    )

    expect(result.thisMonth).toBe(100)
    expect(result.lastMonth).toBe(250)
    expect(result.comparedThrough).toEqual(
      new Date(2026, 1, 28, 23, 59, 59, 999),
    )
  })

  it('rolls back into the previous December in January', () => {
    const now = new Date(2026, 0, 10, 12, 0) // January 10, 2026
    const result = computeSpendToDate(
      [
        gasto(600, new Date(2026, 0, 5)),
        gasto(450, new Date(2025, 11, 10, 21, 0)), // December 10, 2025
        gasto(8888, new Date(2025, 11, 11)), // past the cutoff
      ],
      now,
    )

    expect(result.thisMonth).toBe(600)
    expect(result.lastMonth).toBe(450)
    expect(result.comparedThrough).toEqual(
      new Date(2025, 11, 10, 23, 59, 59, 999),
    )
  })

  it('reports no percentage when the previous month has nothing to divide by', () => {
    const now = new Date(2026, 9, 15)

    const noSpend = computeSpendToDate([gasto(1000, new Date(2026, 9, 2))], now)
    expect(noSpend.lastMonth).toBe(0)
    expect(noSpend.percentChange).toBeNull()
    expect(noSpend.difference).toBe(1000)

    // The negative "ajuste" is the one expense that can leave a month's
    // total below zero; a percentage against it would be nonsense.
    const negative = computeSpendToDate(
      [gasto(1000, new Date(2026, 9, 2)), gasto(-500, new Date(2026, 8, 2))],
      now,
    )
    expect(negative.lastMonth).toBe(-500)
    expect(negative.percentChange).toBeNull()
  })

  it('reports a negative change when this month is the cheaper one', () => {
    const now = new Date(2026, 9, 15)
    const result = computeSpendToDate(
      [gasto(750, new Date(2026, 9, 2)), gasto(1000, new Date(2026, 8, 2))],
      now,
    )

    expect(result.difference).toBe(-250)
    expect(result.percentChange).toBe(-25)
  })

  it('adds cents without drifting', () => {
    const now = new Date(2026, 9, 15)
    const result = computeSpendToDate(
      [
        gasto(0.1, new Date(2026, 9, 1)),
        gasto(0.2, new Date(2026, 9, 2)),
        gasto(0.1, new Date(2026, 8, 1)),
      ],
      now,
    )

    expect(result.thisMonth).toBe(0.3)
    expect(result.difference).toBe(0.2)
  })

  it('returns zeroes for a household that has logged nothing', () => {
    const result = computeSpendToDate([], new Date(2026, 9, 15))

    expect(result.thisMonth).toBe(0)
    expect(result.lastMonth).toBe(0)
    expect(result.difference).toBe(0)
    expect(result.percentChange).toBeNull()
  })
})

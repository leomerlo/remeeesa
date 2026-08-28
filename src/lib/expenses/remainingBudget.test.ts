import { describe, expect, it } from 'vitest'
import {
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
} from './remainingBudget'

describe('formatBudgetAmount', () => {
  it('prefixes whole amounts with a dollar sign', () => {
    expect(formatBudgetAmount(100)).toBe('$100')
  })

  it('formats negative remaining as -$amount', () => {
    expect(formatBudgetAmount(-50)).toBe('-$50')
  })

  it('keeps two decimals when needed', () => {
    expect(formatBudgetAmount(99.5)).toBe('$99.50')
  })
})

describe('computeRemainingBudget', () => {
  it('returns the monthly budget when there are no expenses', () => {
    expect(computeRemainingBudget(100, [])).toBe(100)
  })

  it('returns zero when expenses exactly match the budget', () => {
    expect(computeRemainingBudget(100, [{ price: 40 }, { price: 60 }])).toBe(0)
  })

  it('returns a negative amount when expenses exceed the budget', () => {
    expect(computeRemainingBudget(100, [{ price: 150 }])).toBe(-50)
  })

  it('subtracts 2-decimal prices without extra rounding', () => {
    expect(
      computeRemainingBudget(100.5, [{ price: 10.25 }, { price: 0.25 }]),
    ).toBe(90)
  })
})

describe('currentMonthRange', () => {
  it('returns the local calendar month inclusive of the last millisecond', () => {
    const { monthStart, monthEnd } = currentMonthRange(
      new Date(2026, 7, 15, 12, 30, 0),
    )

    expect(monthStart).toEqual(new Date(2026, 7, 1))
    expect(monthEnd).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999))
  })

  it('covers February in a non-leap year', () => {
    const { monthStart, monthEnd } = currentMonthRange(new Date(2026, 1, 10))

    expect(monthStart).toEqual(new Date(2026, 1, 1))
    expect(monthEnd).toEqual(new Date(2026, 1, 28, 23, 59, 59, 999))
  })

  it('covers December through the last millisecond of the year', () => {
    const { monthStart, monthEnd } = currentMonthRange(new Date(2026, 11, 31))

    expect(monthStart).toEqual(new Date(2026, 11, 1))
    expect(monthEnd).toEqual(new Date(2026, 11, 31, 23, 59, 59, 999))
  })
})

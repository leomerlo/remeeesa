import { describe, expect, it } from 'vitest'
import {
  computePercentUsed,
  computeRemainingBudget,
  computeSpentThisMonth,
  currentMonthRange,
  formatBudgetAmount,
  formatCurrency,
} from './remainingBudget'

describe('computeSpentThisMonth', () => {
  it('returns zero with no expenses', () => {
    expect(computeSpentThisMonth([])).toBe(0)
  })

  it('sums every expense price', () => {
    expect(
      computeSpentThisMonth([{ price: 40 }, { price: 60 }, { price: 5 }]),
    ).toBe(105)
  })

  // The exact figure computeRemainingBudget subtracts from the budget --
  // the two cards on Home have to read off the same number, or "gastado" and
  // "restante" could silently disagree.
  it('is the same sum computeRemainingBudget subtracts from the budget', () => {
    const expenses = [{ price: 40 }, { price: 60 }]
    expect(computeRemainingBudget(100, expenses)).toBe(
      100 - computeSpentThisMonth(expenses),
    )
  })
})

describe('formatCurrency', () => {
  it('always shows two decimals, es-AR style (comma decimal separator)', () => {
    expect(formatCurrency(100)).toBe('$100,00')
  })

  it('inserts a period as the thousands separator', () => {
    expect(formatCurrency(224300)).toBe('$224.300,00')
  })

  it('rounds to two decimals', () => {
    expect(formatCurrency(99.5)).toBe('$99,50')
  })
})

describe('formatBudgetAmount', () => {
  it('prefixes whole amounts with a dollar sign', () => {
    expect(formatBudgetAmount(100)).toBe('$100,00')
  })

  it('formats negative remaining as -$amount', () => {
    expect(formatBudgetAmount(-50)).toBe('-$50,00')
  })

  it('keeps two decimals when needed', () => {
    expect(formatBudgetAmount(99.5)).toBe('$99,50')
  })

  it('formats a large negative remaining with a thousands separator', () => {
    expect(formatBudgetAmount(-224300)).toBe('-$224.300,00')
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

describe('computePercentUsed', () => {
  it('returns 0 when there are no expenses', () => {
    expect(computePercentUsed(100, [])).toBe(0)
  })

  it('returns the percent of budget spent', () => {
    expect(computePercentUsed(100, [{ price: 40 }])).toBe(40)
  })

  it('rounds to the nearest whole percent', () => {
    expect(computePercentUsed(300, [{ price: 100 }])).toBe(33)
  })

  // A 0 (or negative) budget has nothing meaningful to divide by -- treat
  // it as fully used once there's any spend, and 0% with no spend, rather
  // than dividing by zero into NaN/Infinity.
  it('returns 0 for a zero budget with no expenses', () => {
    expect(computePercentUsed(0, [])).toBe(0)
  })

  it('returns 100 for a zero budget with any expense', () => {
    expect(computePercentUsed(0, [{ price: 10 }])).toBe(100)
  })

  // Spending past the budget clamps at 100 rather than reporting e.g. 150%
  // -- a progress bar has nowhere to put the overflow, and the exact
  // over-budget amount is already shown by computeRemainingBudget going
  // negative.
  it('clamps at 100 when expenses exceed the budget', () => {
    expect(computePercentUsed(100, [{ price: 150 }])).toBe(100)
  })

  it('returns exactly 100 when spending exactly matches the budget', () => {
    expect(computePercentUsed(100, [{ price: 40 }, { price: 60 }])).toBe(100)
  })

  it('still clamps at 100 when spending is far past the budget', () => {
    expect(computePercentUsed(100, [{ price: 1000 }])).toBe(100)
  })

  it('treats a zero-price expense as no additional spend', () => {
    expect(computePercentUsed(100, [{ price: 0 }])).toBe(0)
  })

  it('rounds a half-percent boundary up', () => {
    // 200.5 / 401 * 100 == 50.0-ish but chosen to land exactly on x.5 --
    // Math.round rounds half away from zero in JS, so this must come out
    // one whole point higher than truncation would give.
    expect(computePercentUsed(200, [{ price: 101 }])).toBe(51)
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

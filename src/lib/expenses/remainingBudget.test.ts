import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  computePendingCommitted,
  computePercentUsed,
  computeRemainingBudget,
  computeSpentThisMonth,
  currentMonthRange,
  formatBudgetAmount,
  formatCurrency,
} from './remainingBudget'

// Every fixture here is a peso amount; the dollar case has its own test.
const ARS = 'ARS' as const

describe('computeSpentThisMonth', () => {
  it('returns zero with no expenses', () => {
    expect(computeSpentThisMonth([])).toBe(0)
  })

  it('sums every expense price', () => {
    expect(
      computeSpentThisMonth([
        { price: 40, currency: ARS },
        { price: 60, currency: ARS },
        { price: 5, currency: ARS },
      ]),
    ).toBe(105)
  })

  // The exact figure computeRemainingBudget subtracts from the budget --
  // the two cards on Home have to read off the same number, or "gastado" and
  // "restante" could silently disagree.
  it('is the same sum computeRemainingBudget subtracts from the budget', () => {
    const expenses = [
      { price: 40, currency: ARS },
      { price: 60, currency: ARS },
    ]
    expect(computeRemainingBudget(100, expenses)).toBe(
      100 - computeSpentThisMonth(expenses),
    )
  })
})

describe('computePendingCommitted', () => {
  it('returns zero with no pendientes', () => {
    expect(computePendingCommitted([])).toBe(0)
  })

  it("sums every pendiente's expected amount", () => {
    expect(
      computePendingCommitted([
        { expectedAmount: 300 },
        { expectedAmount: 700 },
      ]),
    ).toBe(1000)
  })

  it('skips a pendiente with no expected amount yet, rather than treating it as zero', () => {
    expect(
      computePendingCommitted([
        { expectedAmount: 300 },
        { expectedAmount: null },
      ]),
    ).toBe(300)
  })
})

describe('formatCurrency', () => {
  it('drops the decimals on a round amount', () => {
    expect(formatCurrency(100)).toBe('$100')
  })

  it('inserts a period as the thousands separator', () => {
    expect(formatCurrency(224300)).toBe('$224.300')
  })

  it('keeps both decimals, es-AR style, when there are cents', () => {
    expect(formatCurrency(99.5)).toBe('$99,50')
    expect(formatCurrency(1234.05)).toBe('$1.234,05')
  })

  it('decides on the printed value, not the raw one', () => {
    // Rounds to "$1", so it has no cents to show even though the input has.
    expect(formatCurrency(0.999)).toBe('$1')
    // Rounds to "$0,01", which does.
    expect(formatCurrency(0.005)).toBe('$0,01')
  })
})

describe('formatBudgetAmount', () => {
  it('prefixes whole amounts with a dollar sign, no decimals', () => {
    expect(formatBudgetAmount(100)).toBe('$100')
  })

  it('formats negative remaining as -$amount', () => {
    expect(formatBudgetAmount(-50)).toBe('-$50')
    // Every formatter keeps the sign, not just this one: a card Resumen
    // paid for less than it said generates a negative "ajuste" expense, and
    // the list it appears in used to print it as a positive figure -- so
    // the rows no longer added up to the month total above them.
    expect(formatCurrency(-50)).toBe('-$50')
    expect(formatCurrency(-1850.5)).toBe('-$1.850,50')
    expect(formatAmount(-120, 'USD')).toBe('-US$120')
    expect(formatAmount(-120, 'ARS')).toBe('-$120')
  })

  it('keeps two decimals when needed', () => {
    expect(formatBudgetAmount(99.5)).toBe('$99,50')
  })

  it('formats a large negative remaining with a thousands separator', () => {
    expect(formatBudgetAmount(-224300)).toBe('-$224.300')
  })
})

// The rule the whole currency change exists for: a dollar amount is
// recorded, but the budget is a number of pesos and never counts it.
describe('dollar amounts', () => {
  it('are left out of what the month spent', () => {
    expect(
      computeSpentThisMonth([
        { price: 40, currency: ARS },
        { price: 1000, currency: 'USD' },
      ]),
    ).toBe(40)
  })

  it('leave the remaining budget untouched', () => {
    expect(
      computeRemainingBudget(100, [
        { price: 40, currency: ARS },
        { price: 1000, currency: 'USD' },
      ]),
    ).toBe(60)
  })

  it('do not move the percentage used', () => {
    expect(
      computePercentUsed(100, [
        { price: 40, currency: ARS },
        { price: 5000, currency: 'USD' },
      ]),
    ).toBe(40)
  })
})

describe('computeRemainingBudget', () => {
  it('returns the monthly budget when there are no expenses', () => {
    expect(computeRemainingBudget(100, [])).toBe(100)
  })

  it('returns zero when expenses exactly match the budget', () => {
    expect(
      computeRemainingBudget(100, [
        { price: 40, currency: ARS },
        { price: 60, currency: ARS },
      ]),
    ).toBe(0)
  })

  it('returns a negative amount when expenses exceed the budget', () => {
    expect(computeRemainingBudget(100, [{ price: 150, currency: ARS }])).toBe(
      -50,
    )
  })

  it('subtracts 2-decimal prices without extra rounding', () => {
    expect(
      computeRemainingBudget(100.5, [
        { price: 10.25, currency: ARS },
        { price: 0.25, currency: ARS },
      ]),
    ).toBe(90)
  })

  // Per direct feedback: a Pendiente still owed has to count against
  // what's "left" too, not just once it's actually paid.
  it('additionally subtracts pendingCommitted when given', () => {
    expect(
      computeRemainingBudget(100, [{ price: 40, currency: ARS }], 30),
    ).toBe(30)
  })

  it('defaults pendingCommitted to zero, unchanged from before this existed', () => {
    expect(computeRemainingBudget(100, [{ price: 40, currency: ARS }])).toBe(
      computeRemainingBudget(100, [{ price: 40, currency: ARS }], 0),
    )
  })
})

describe('computePercentUsed', () => {
  it('returns 0 when there are no expenses', () => {
    expect(computePercentUsed(100, [])).toBe(0)
  })

  it('returns the percent of budget spent', () => {
    expect(computePercentUsed(100, [{ price: 40, currency: ARS }])).toBe(40)
  })

  it('rounds to the nearest whole percent', () => {
    expect(computePercentUsed(300, [{ price: 100, currency: ARS }])).toBe(33)
  })

  // A 0 (or negative) budget has nothing meaningful to divide by -- treat
  // it as fully used once there's any spend, and 0% with no spend, rather
  // than dividing by zero into NaN/Infinity.
  it('returns 0 for a zero budget with no expenses', () => {
    expect(computePercentUsed(0, [])).toBe(0)
  })

  it('returns 100 for a zero budget with any expense', () => {
    expect(computePercentUsed(0, [{ price: 10, currency: ARS }])).toBe(100)
  })

  // It does NOT clamp any more: a household $107.000 past its budget read
  // "100% usado" beside a negative figure, which is the one moment the
  // number most needs to be blunt. The progress *bar* still clamps, since
  // it has nowhere to put the overflow; that belongs at the bar.
  it('reports past 100 when expenses exceed the budget', () => {
    expect(computePercentUsed(100, [{ price: 150, currency: ARS }])).toBe(150)
  })

  it('returns exactly 100 when spending exactly matches the budget', () => {
    expect(
      computePercentUsed(100, [
        { price: 40, currency: ARS },
        { price: 60, currency: ARS },
      ]),
    ).toBe(100)
  })

  it('keeps counting when spending is far past the budget', () => {
    expect(computePercentUsed(100, [{ price: 1000, currency: ARS }])).toBe(1000)
  })

  it('treats a zero-price expense as no additional spend', () => {
    expect(computePercentUsed(100, [{ price: 0, currency: ARS }])).toBe(0)
  })

  it('rounds a half-percent boundary up', () => {
    // 200.5 / 401 * 100 == 50.0-ish but chosen to land exactly on x.5 --
    // Math.round rounds half away from zero in JS, so this must come out
    // one whole point higher than truncation would give.
    expect(computePercentUsed(200, [{ price: 101, currency: ARS }])).toBe(51)
  })

  it('folds pendingCommitted into the percentage when given', () => {
    expect(computePercentUsed(100, [{ price: 40, currency: ARS }], 30)).toBe(70)
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

describe('formatAmount', () => {
  it('leaves a peso amount as the bare "$" the whole app uses', () => {
    expect(formatAmount(1234.5, 'ARS')).toBe('$1.234,50')
  })

  // "$" alone always means pesos here, so a dollar figure has to say so.
  it('marks a dollar amount as US$', () => {
    expect(formatAmount(1234.5, 'USD')).toBe('US$1.234,50')
  })

  it('keeps the round-amount rule in both currencies', () => {
    expect(formatAmount(1000, 'ARS')).toBe('$1.000')
    expect(formatAmount(1000, 'USD')).toBe('US$1.000')
  })
})

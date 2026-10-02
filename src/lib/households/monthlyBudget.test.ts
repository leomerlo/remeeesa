import { describe, expect, it } from 'vitest'
import {
  monthKey,
  monthlyBudgetFor,
  withMonthlyBudgetFor,
} from './monthlyBudget'
import type { Household } from './types'

function household(
  monthlyBudgets: Readonly<Record<string, number>>,
  monthlyBudget = 900000,
): Household {
  return {
    id: 'h1',
    name: 'Casa Verde',
    monthlyBudget,
    monthlyBudgets,
    createdAt: new Date(2026, 8, 1),
  }
}

const SEPTEMBER = new Date(2026, 8, 15)
const OCTOBER = new Date(2026, 9, 15)
const NOVEMBER = new Date(2026, 10, 15)
const AUGUST = new Date(2026, 7, 15)

describe('monthKey', () => {
  it('pads the month so the keys sort in calendar order', () => {
    expect(monthKey(new Date(2026, 8, 15))).toBe('2026-09')
    expect(monthKey(new Date(2026, 11, 1))).toBe('2026-12')
    expect(['2026-09', '2026-10', '2026-12'].sort()).toEqual([
      '2026-09',
      '2026-10',
      '2026-12',
    ])
  })
})

describe('monthlyBudgetFor', () => {
  it('gives a month the figure set for that month', () => {
    const casa = household({ '2026-09': 5355000, '2026-10': 900000 })

    expect(monthlyBudgetFor(casa, SEPTEMBER)).toBe(5355000)
    expect(monthlyBudgetFor(casa, OCTOBER)).toBe(900000)
  })

  // The point of the whole thing: raising it in October must not rewrite
  // what September was measured against.
  it('leaves a past month on the figure it was run on', () => {
    const before = household({ '2026-09': 5355000 })
    const after = household(
      withMonthlyBudgetFor({
        household: before,
        month: OCTOBER,
        monthlyBudget: 900000,
      }),
    )

    expect(monthlyBudgetFor(after, SEPTEMBER)).toBe(5355000)
    expect(monthlyBudgetFor(after, OCTOBER)).toBe(900000)
  })

  // Leaving the budget alone is the common case, and means "same as before".
  it('carries the last figure forward into a month that never set one', () => {
    const casa = household({ '2026-09': 5355000, '2026-10': 900000 })

    expect(monthlyBudgetFor(casa, NOVEMBER)).toBe(900000)
  })

  // Not today's figure: that one moves every time the budget is edited,
  // which would quietly rewrite a month nobody touched.
  it('gives a month older than every snapshot the earliest one', () => {
    const casa = household({ '2026-09': 5355000, '2026-10': 900000 })

    expect(monthlyBudgetFor(casa, AUGUST)).toBe(5355000)
  })

  it('falls back to the plain field for a household with no snapshots at all', () => {
    const legacy = household({}, 750000)

    expect(monthlyBudgetFor(legacy, SEPTEMBER)).toBe(750000)
    expect(monthlyBudgetFor(legacy, OCTOBER)).toBe(750000)
  })

  it('reads zero as a real figure, not as a missing one', () => {
    const casa = household({ '2026-09': 0 }, 900000)

    expect(monthlyBudgetFor(casa, SEPTEMBER)).toBe(0)
  })

  it('crosses a year boundary in the right direction', () => {
    const casa = household({ '2026-12': 100, '2027-01': 200 })

    expect(monthlyBudgetFor(casa, new Date(2026, 11, 5))).toBe(100)
    expect(monthlyBudgetFor(casa, new Date(2027, 0, 5))).toBe(200)
    expect(monthlyBudgetFor(casa, new Date(2027, 5, 5))).toBe(200)
  })
})

describe('withMonthlyBudgetFor', () => {
  it('writes only the month being edited', () => {
    const casa = household({ '2026-09': 5355000 })

    expect(
      withMonthlyBudgetFor({
        household: casa,
        month: OCTOBER,
        monthlyBudget: 900000,
      }),
    ).toEqual({ '2026-09': 5355000, '2026-10': 900000 })
  })

  it('replaces the figure when the same month is edited again', () => {
    const casa = household({ '2026-09': 5355000 })

    expect(
      withMonthlyBudgetFor({
        household: casa,
        month: SEPTEMBER,
        monthlyBudget: 6000000,
      }),
    ).toEqual({ '2026-09': 6000000 })
  })
})

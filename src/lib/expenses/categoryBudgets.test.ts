import { describe, expect, it } from 'vitest'
import {
  categoryBudgetRows,
  categoryBudgetsOverspill,
  resolveCategoryBudget,
  setBudget,
  totalCategoryBudgets,
} from './categoryBudgets'
import type { CategorySummary } from './summaries'
import type { Category } from './types'

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cafe',
    householdId: 'h1',
    name: 'Café',
    color: '#b33667',
    monthlyBudget: 0,
    budgets: {},
    createdAt: new Date(2026, 0, 1),
    ...overrides,
  }
}

function summary(categoryId: string, total: number): CategorySummary {
  return { categoryId, name: categoryId, color: '#000000', total, share: 0 }
}

describe('categoryBudgetRows', () => {
  it('leaves out the categories with no ceiling', () => {
    const rows = categoryBudgetRows({
      categories: [
        category({ id: 'cafe', monthlyBudget: 30000 }),
        category({ id: 'otros', monthlyBudget: 0 }),
      ],
      summaries: [summary('cafe', 9000), summary('otros', 500000)],
    })

    expect(rows.map((row) => row.categoryId)).toEqual(['cafe'])
  })

  // The most useful moment of the month to see a ceiling is before anything
  // has gone into it, and summarizeByCategory drops a category with no spend.
  it('keeps a capped category that has had nothing spent in it yet', () => {
    const [row] = categoryBudgetRows({
      categories: [category({ monthlyBudget: 30000 })],
      summaries: [],
    })

    expect(row?.spent).toBe(0)
    expect(row?.remaining).toBe(30000)
    expect(row?.percentUsed).toBe(0)
    expect(row?.overBudget).toBe(false)
  })

  it('reports what is left and how much of the ceiling is gone', () => {
    const [row] = categoryBudgetRows({
      categories: [category({ monthlyBudget: 30000 })],
      summaries: [summary('cafe', 9000)],
    })

    expect(row?.spent).toBe(9000)
    expect(row?.remaining).toBe(21000)
    expect(row?.percentUsed).toBe(30)
    expect(row?.overBudget).toBe(false)
  })

  it('says so when the ceiling is passed, and shows how far over', () => {
    const [row] = categoryBudgetRows({
      categories: [category({ monthlyBudget: 30000 })],
      summaries: [summary('cafe', 42000)],
    })

    expect(row?.overBudget).toBe(true)
    expect(row?.remaining).toBe(-12000)
    // Clamped so the bar cannot run past its track; the figures beside it
    // are not, because going over is the thing worth seeing.
    expect(row?.percentUsed).toBe(100)
  })

  it('puts the tightest category first', () => {
    const rows = categoryBudgetRows({
      categories: [
        category({ id: 'cafe', monthlyBudget: 30000 }),
        category({ id: 'super', monthlyBudget: 100000 }),
      ],
      summaries: [summary('cafe', 3000), summary('super', 90000)],
    })

    expect(rows.map((row) => row.categoryId)).toEqual(['super', 'cafe'])
  })
})

describe('totalCategoryBudgets', () => {
  it('adds up only what has actually been capped', () => {
    expect(
      totalCategoryBudgets([
        category({ id: 'cafe', monthlyBudget: 30000 }),
        category({ id: 'super', monthlyBudget: 100000 }),
        category({ id: 'otros', monthlyBudget: 0 }),
      ]),
    ).toBe(130000)
  })
})

describe('categoryBudgetsOverspill', () => {
  // Ceilings are meant not to add up: you cap the few that matter.
  it('is silent while the ceilings fit inside the monthly budget', () => {
    expect(
      categoryBudgetsOverspill({
        categories: [category({ monthlyBudget: 30000 })],
        monthlyBudget: 900000,
      }),
    ).toBe(0)
  })

  it('reports how much more has been promised than the household has', () => {
    expect(
      categoryBudgetsOverspill({
        categories: [
          category({ id: 'cafe', monthlyBudget: 600000 }),
          category({ id: 'super', monthlyBudget: 500000 }),
        ],
        monthlyBudget: 900000,
      }),
    ).toBe(200000)
  })

  it('says nothing when there is no monthly budget to be over', () => {
    expect(
      categoryBudgetsOverspill({
        categories: [category({ monthlyBudget: 600000 })],
        monthlyBudget: 0,
      }),
    ).toBe(0)
  })
})

// The story's walk-through: a budget set in March carries forward until the
// household changes it, a change only reaches forward from its own month,
// and clearing a month means "no budget from here on" -- not "inherit".
describe('resolveCategoryBudget', () => {
  it('inherits the latest month set before the one asked for', () => {
    const budgets = { '2026-03': 300 }

    expect(resolveCategoryBudget(budgets, '2026-03')).toBe(300)
    expect(resolveCategoryBudget(budgets, '2026-04')).toBe(300)
  })

  it('applies an edit from its own month on and leaves earlier months alone', () => {
    const budgets = { '2026-03': 300, '2026-04': 400 }

    expect(resolveCategoryBudget(budgets, '2026-03')).toBe(300)
    expect(resolveCategoryBudget(budgets, '2026-04')).toBe(400)
    expect(resolveCategoryBudget(budgets, '2026-05')).toBe(400)
  })

  it('reads a cleared month, and every month after it, as having no budget', () => {
    const budgets = { '2026-03': 300, '2026-04': null }

    expect(resolveCategoryBudget(budgets, '2026-03')).toBe(300)
    expect(resolveCategoryBudget(budgets, '2026-04')).toBeNull()
    expect(resolveCategoryBudget(budgets, '2026-05')).toBeNull()
  })

  it('has no budget when none was ever set', () => {
    expect(resolveCategoryBudget({}, '2026-04')).toBeNull()
  })

  it('has no budget in a month before the first one set', () => {
    expect(resolveCategoryBudget({ '2026-03': 300 }, '2026-02')).toBeNull()
  })

  it('compares months across a year boundary', () => {
    expect(resolveCategoryBudget({ '2025-12': 300 }, '2026-01')).toBe(300)
  })
})

describe('setBudget', () => {
  it('writes only the edited month', () => {
    expect(setBudget({ '2026-03': 300 }, '2026-04', 400)).toEqual({
      '2026-03': 300,
      '2026-04': 400,
    })
  })

  it('does not change the map it was given', () => {
    const budgets = { '2026-03': 300 }

    setBudget(budgets, '2026-03', 500)

    expect(budgets).toEqual({ '2026-03': 300 })
  })

  it('clears a month with null, which is not the same as zero', () => {
    expect(setBudget({ '2026-03': 300 }, '2026-04', null)).toEqual({
      '2026-03': 300,
      '2026-04': null,
    })
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses %s as an amount',
    (amount) => {
      expect(() => setBudget({}, '2026-04', amount)).toThrow(
        'El presupuesto de la categoría tiene que ser mayor a 0',
      )
    },
  )

  it.each(['2026-13', '2026-4', 'abril', ''])(
    'refuses %j as a month',
    (month) => {
      expect(() => setBudget({}, month, 300)).toThrow(
        'El mes del presupuesto no es válido',
      )
    },
  )
})

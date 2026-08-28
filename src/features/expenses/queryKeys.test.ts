import { describe, expect, it } from 'vitest'
import {
  categoriesQueryKey,
  expenseListQueryKey,
  expensesInMonthQueryKey,
} from './queryKeys'

describe('expense query keys', () => {
  it('scopes categories and month expenses to the household', () => {
    expect(categoriesQueryKey({ householdId: 'hh-1' })).toEqual([
      'categories',
      'hh-1',
    ])
    expect(expensesInMonthQueryKey({ householdId: 'hh-1' })).toEqual([
      'expenses-in-month',
      'hh-1',
    ])
    expect(
      expenseListQueryKey({ householdId: 'hh-1', year: 2026, month: 7 }),
    ).toEqual(['expense-list', 'hh-1', 2026, 7])
  })
})

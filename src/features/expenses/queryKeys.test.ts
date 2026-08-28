import { describe, expect, it } from 'vitest'
import { categoriesQueryKey, expensesInMonthQueryKey } from './queryKeys'

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
  })
})

import { describe, expect, it } from 'vitest'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

describe('parseHouseholdName', () => {
  it('rejects an empty string', () => {
    expect(() => parseHouseholdName('')).toThrow(
      'Household name must be non-empty',
    )
  })
})

describe('parseMonthlyBudget', () => {
  it('rejects NaN and Infinity', () => {
    expect(() => parseMonthlyBudget(Number.NaN)).toThrow(
      'Monthly budget must be a positive number',
    )
    expect(() => parseMonthlyBudget(Number.POSITIVE_INFINITY)).toThrow(
      'Monthly budget must be a positive number',
    )
    expect(() => parseMonthlyBudget(Number.NEGATIVE_INFINITY)).toThrow(
      'Monthly budget must be a positive number',
    )
  })
})

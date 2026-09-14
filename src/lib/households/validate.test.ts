import { describe, expect, it } from 'vitest'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

describe('parseHouseholdName', () => {
  it('rejects an empty string', () => {
    expect(() => parseHouseholdName('')).toThrow(
      'El nombre del hogar no puede estar vacío',
    )
  })
})

const MSG = 'El presupuesto mensual no puede ser negativo'

describe('parseMonthlyBudget', () => {
  it('rejects NaN and Infinity', () => {
    expect(() => parseMonthlyBudget(Number.NaN)).toThrow(MSG)
    expect(() => parseMonthlyBudget(Number.POSITIVE_INFINITY)).toThrow(MSG)
    expect(() => parseMonthlyBudget(Number.NEGATIVE_INFINITY)).toThrow(MSG)
  })

  it('rejects a negative budget', () => {
    expect(() => parseMonthlyBudget(-1)).toThrow(MSG)
  })

  // Zero is "sin presupuesto", a state the app supports: the household can
  // log what it spends and put a budget in later.
  it('accepts zero', () => {
    expect(parseMonthlyBudget(0)).toBe(0)
  })

  it('accepts a positive budget', () => {
    expect(parseMonthlyBudget(900000)).toBe(900000)
  })
})

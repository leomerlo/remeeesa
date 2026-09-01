import { describe, expect, it } from 'vitest'
import { parseHouseholdName, parseMonthlyBudget } from './validate'

describe('parseHouseholdName', () => {
  it('rejects an empty string', () => {
    expect(() => parseHouseholdName('')).toThrow(
      'El nombre del hogar no puede estar vacío',
    )
  })
})

describe('parseMonthlyBudget', () => {
  it('rejects NaN and Infinity', () => {
    expect(() => parseMonthlyBudget(Number.NaN)).toThrow(
      'El presupuesto mensual debe ser un número positivo',
    )
    expect(() => parseMonthlyBudget(Number.POSITIVE_INFINITY)).toThrow(
      'El presupuesto mensual debe ser un número positivo',
    )
    expect(() => parseMonthlyBudget(Number.NEGATIVE_INFINITY)).toThrow(
      'El presupuesto mensual debe ser un número positivo',
    )
  })
})

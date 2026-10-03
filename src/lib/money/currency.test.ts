import { describe, expect, it } from 'vitest'
import {
  countedByBudget,
  countsTowardBudget,
  DEFAULT_CURRENCY,
  isCurrency,
  parseCurrency,
} from './currency'

describe('parseCurrency', () => {
  it('reads the two currencies it knows', () => {
    expect(parseCurrency('ARS')).toBe('ARS')
    expect(parseCurrency('USD')).toBe('USD')
  })

  // A household that had no way to record a dollar cannot have recorded one,
  // so anything written before the field existed is pesos.
  it('reads anything else as pesos rather than failing', () => {
    expect(parseCurrency(undefined)).toBe('ARS')
    expect(parseCurrency(null)).toBe('ARS')
    expect(parseCurrency('EUR')).toBe('ARS')
    expect(parseCurrency(7)).toBe('ARS')
  })

  it('agrees with isCurrency about what it knows', () => {
    expect(isCurrency('ARS')).toBe(true)
    expect(isCurrency('USD')).toBe(true)
    expect(isCurrency('EUR')).toBe(false)
  })

  it('treats pesos as the default', () => {
    expect(DEFAULT_CURRENCY).toBe('ARS')
  })
})

describe('countsTowardBudget', () => {
  it('counts pesos and leaves dollars out', () => {
    expect(countsTowardBudget({ currency: 'ARS' })).toBe(true)
    expect(countsTowardBudget({ currency: 'USD' })).toBe(false)
  })
})

describe('countedByBudget', () => {
  it('keeps the peso amounts and drops the dollar ones', () => {
    const items = [
      { id: 'a', currency: 'ARS' as const },
      { id: 'b', currency: 'USD' as const },
      { id: 'c', currency: 'ARS' as const },
    ]

    expect(countedByBudget(items).map((item) => item.id)).toEqual(['a', 'c'])
  })

  it('leaves an all-peso list untouched', () => {
    const items = [{ currency: 'ARS' as const }]

    expect(countedByBudget(items)).toEqual(items)
  })
})

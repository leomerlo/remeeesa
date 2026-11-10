import { describe, expect, it } from 'vitest'
import {
  cardAccepts,
  countedByBudget,
  countsTowardBudget,
  currenciesOf,
  DEFAULT_CURRENCY,
  defaultCurrencyOf,
  isCurrency,
  parseCardCurrency,
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

describe('parseCardCurrency', () => {
  it('keeps each of the three values a card can hold', () => {
    expect(parseCardCurrency('ARS')).toBe('ARS')
    expect(parseCardCurrency('USD')).toBe('USD')
    expect(parseCardCurrency('BOTH')).toBe('BOTH')
  })

  it('reads a card written before currencies existed as pesos', () => {
    expect(parseCardCurrency(undefined)).toBe('ARS')
    expect(parseCardCurrency('EUR')).toBe('ARS')
  })
})

describe('currenciesOf', () => {
  it('offers both currencies on a both-currencies card, pesos first', () => {
    expect(currenciesOf('BOTH')).toEqual(['ARS', 'USD'])
  })

  it('offers only its own on a single-currency card', () => {
    expect(currenciesOf('ARS')).toEqual(['ARS'])
    expect(currenciesOf('USD')).toEqual(['USD'])
  })
})

describe('defaultCurrencyOf', () => {
  it('starts a both-currencies card in pesos', () => {
    expect(defaultCurrencyOf('BOTH')).toBe('ARS')
  })

  it('starts a single-currency card in its own currency', () => {
    expect(defaultCurrencyOf('USD')).toBe('USD')
    expect(defaultCurrencyOf('ARS')).toBe('ARS')
  })
})

describe('cardAccepts', () => {
  it('lets a both-currencies card take either one', () => {
    expect(cardAccepts('BOTH', 'ARS')).toBe(true)
    expect(cardAccepts('BOTH', 'USD')).toBe(true)
  })

  it('refuses the currency a single-currency card does not hold', () => {
    expect(cardAccepts('ARS', 'USD')).toBe(false)
    expect(cardAccepts('USD', 'ARS')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { parseCardDocument, parseCardPurchaseDocument } from './converters'

const createdAt = new Date(2026, 8, 1)

describe('parseCardDocument', () => {
  it('parses a valid document', () => {
    expect(
      parseCardDocument({
        id: 'card-1',
        data: { household_id: 'h-1', name: 'Visa', created_at: createdAt },
      }),
    ).toEqual({
      id: 'card-1',
      householdId: 'h-1',
      name: 'Visa',
      // No stored kind: every method written before kinds existed is a
      // credit card, which is all this collection could hold.
      kind: 'credito',
      // No stored currency: every card written before they existed is in
      // pesos, since there was no way to record anything else.
      currency: 'ARS',
      // Same for the brand: a card written before brands existed carries
      // no mark, which reads as "otra".
      brand: 'otra',
      createdAt,
    })
  })

  it('reads a card stored in dollars', () => {
    expect(
      parseCardDocument({
        id: 'card-1',
        data: {
          household_id: 'h-1',
          name: 'Amex',
          currency: 'USD',
          created_at: createdAt,
        },
      }).currency,
    ).toBe('USD')
  })

  it('rejects a blank name', () => {
    expect(() =>
      parseCardDocument({
        id: 'card-1',
        data: { household_id: 'h-1', name: '  ', created_at: createdAt },
      }),
    ).toThrow('name must be a non-empty string')
  })

  it('rejects a missing household_id', () => {
    expect(() =>
      parseCardDocument({
        id: 'card-1',
        data: { name: 'Visa', created_at: createdAt },
      }),
    ).toThrow('household_id must be a non-empty string')
  })

  it('rejects a non-object document', () => {
    expect(() => parseCardDocument({ id: 'card-1', data: null })).toThrow(
      'Card document must be an object',
    )
  })

  it('rejects a missing created_at', () => {
    expect(() =>
      parseCardDocument({
        id: 'card-1',
        data: { household_id: 'h-1', name: 'Visa' },
      }),
    ).toThrow('created_at must be a timestamp')
  })
})

describe('parseCardPurchaseDocument', () => {
  const data = {
    household_id: 'h-1',
    card_id: 'card-1',
    category_id: 'cat-1',
    member_id: 'user-1',
    author_display_name: 'Ada',
    name: 'Zapatillas',
    total: 300,
    cuotas: 3,
    purchase_date: new Date(2026, 8, 5),
    comments: '',
    created_at: createdAt,
  }

  it('parses a valid document', () => {
    expect(parseCardPurchaseDocument({ id: 'p-1', data })).toEqual({
      id: 'p-1',
      householdId: 'h-1',
      cardId: 'card-1',
      categoryId: 'cat-1',
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Zapatillas',
      total: 300,
      cuotas: 3,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
      currency: 'ARS',
      createdAt,
      paidResumenIds: [],
    })
  })

  it('reads a dollar purchase, and a currency-less one as pesos', () => {
    expect(
      parseCardPurchaseDocument({
        id: 'p-1',
        data: { ...data, currency: 'USD' },
      }).currency,
    ).toBe('USD')
    expect(parseCardPurchaseDocument({ id: 'p-1', data }).currency).toBe('ARS')
  })

  it('reads the paid Resúmenes that lock it', () => {
    expect(
      parseCardPurchaseDocument({
        id: 'p-1',
        data: { ...data, paid_resumen_ids: ['card-1_2026-10'] },
      }).paidResumenIds,
    ).toEqual(['card-1_2026-10'])
    expect(() =>
      parseCardPurchaseDocument({
        id: 'p-1',
        data: { ...data, paid_resumen_ids: 'card-1_2026-10' },
      }),
    ).toThrow('paid_resumen_ids must be a list of strings')
  })

  it('rejects a non-integer cuotas', () => {
    expect(() =>
      parseCardPurchaseDocument({ id: 'p-1', data: { ...data, cuotas: 1.5 } }),
    ).toThrow('cuotas must be an integer')
  })

  it('rejects a missing total', () => {
    expect(() =>
      parseCardPurchaseDocument({ id: 'p-1', data: { ...data, total: '3' } }),
    ).toThrow('total must be a number')
  })
})

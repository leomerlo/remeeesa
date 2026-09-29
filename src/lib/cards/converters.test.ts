import { describe, expect, it } from 'vitest'
import { parseCardDocument } from './converters'

const createdAt = new Date(2026, 8, 1)

describe('parseCardDocument', () => {
  it('parses a valid document', () => {
    expect(
      parseCardDocument({
        id: 'card-1',
        data: { household_id: 'h-1', name: 'Visa', created_at: createdAt },
      }),
    ).toEqual({ id: 'card-1', householdId: 'h-1', name: 'Visa', createdAt })
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

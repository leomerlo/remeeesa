import { describe, expect, it } from 'vitest'
import { categoryDocumentId } from './seed'

describe('categoryDocumentId', () => {
  it('is unique per household and case-insensitive trimmed name', () => {
    expect(categoryDocumentId({ householdId: 'house-1', name: 'Comida' })).toBe(
      categoryDocumentId({ householdId: 'house-1', name: '  comida ' }),
    )
    expect(categoryDocumentId({ householdId: 'house-1', name: 'Comida' })).toBe(
      categoryDocumentId({ householdId: 'house-1', name: 'COMIDA' }),
    )
    expect(
      categoryDocumentId({ householdId: 'house-1', name: 'Comida' }),
    ).not.toBe(categoryDocumentId({ householdId: 'house-2', name: 'Comida' }))
    expect(
      categoryDocumentId({ householdId: 'house-1', name: 'Comida' }),
    ).not.toBe(
      categoryDocumentId({ householdId: 'house-1', name: 'Transporte' }),
    )
  })
})

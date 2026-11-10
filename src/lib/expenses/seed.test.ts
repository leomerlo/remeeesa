import { describe, expect, it } from 'vitest'
import { categoryDocumentId, defaultCategoryRecords } from './seed'

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

  it('keeps one row when the same household and name are written twice', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    const first = defaultCategoryRecords({ householdId: 'h1', createdAt })
    const again = defaultCategoryRecords({ householdId: 'h1', createdAt })
    const byId = new Map<string, string>()
    for (const category of [...first, ...again]) {
      byId.set(category.id, category.name)
    }
    expect(byId.size).toBe(6)
    expect([...byId.values()]).toEqual([
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
    ])
  })
})

describe('defaultCategoryRecords colors', () => {
  it('assigns a deterministic color to every default category', () => {
    const createdAt = new Date('2026-01-15T12:00:00.000Z')
    const first = defaultCategoryRecords({ householdId: 'h1', createdAt })
    const second = defaultCategoryRecords({ householdId: 'h1', createdAt })

    // Not colorForCategoryName any more: the names are assigned in one
    // pass, each told what the ones before it took, so a default set never
    // opens with two identical dots -- which the bare hash of the name did
    // (four of the defaults landed on the same violet).
    expect(new Set(first.map((category) => category.color)).size).toBe(
      first.length,
    )
    expect(first.map((category) => category.color)).toEqual(
      second.map((category) => category.color),
    )
  })
})

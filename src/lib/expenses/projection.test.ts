import { describe, expect, it } from 'vitest'
import { buildProjection } from './projection'
import type { Expense } from './types'

function expense(
  categoryId: string,
  price: number,
  name = 'x',
  isService = false,
): Expense {
  return {
    id: `${categoryId}-${String(price)}`,
    householdId: 'h',
    categoryId,
    memberId: 'm',
    authorDisplayName: 'A',
    name,
    price,
    comments: '',
    expenseDate: new Date(),
    pendienteId: null,
    isService,
    subcategory: null,
    currency: 'ARS' as const,
    createdAt: new Date(),
  }
}

describe('buildProjection', () => {
  it('sums this month per category and carries over categories not yet seen', () => {
    const rows = buildProjection(
      [expense('a', 100), expense('b', 20), expense('b', 30)],
      [expense('a', 60), expense('a', 50)],
    )
    expect(rows).toEqual([
      { categoryId: 'a', price: 110, source: 'actual' },
      { categoryId: 'b', price: 50, source: 'projected' },
    ])
  })

  it('counts a recurring servicio once, from the active month', () => {
    const rows = buildProjection(
      [expense('b', 20), expense('b', 40, 'Internet', true)],
      [],
      [' internet '],
    )
    expect(rows).toEqual([{ categoryId: 'b', price: 20, source: 'projected' }])
  })

  it('matches a bill paid through Servicios, ignoring accents', () => {
    const paid = {
      ...expense('b', 40, 'Tarjeta de crédito'),
      pendienteId: 'p1',
    }
    expect(buildProjection([paid], [], ['Tarjeta de credito'])).toEqual([])
  })
})

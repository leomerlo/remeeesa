import { describe, expect, it } from 'vitest'
import { buildProjection } from './projection'
import type { Expense } from './types'

function expense(id: string, name: string, price: number): Expense {
  return {
    id,
    householdId: 'h',
    categoryId: 'c',
    memberId: 'm',
    authorDisplayName: 'A',
    name,
    price,
    comments: '',
    expenseDate: new Date(),
    pendienteId: null,
    isService: false,
    createdAt: new Date(),
  }
}

describe('buildProjection', () => {
  it('keeps current expenses and carries over only the missing previous ones', () => {
    const rows = buildProjection(
      [expense('p1', 'Alquiler', 100), expense('p2', 'Luz', 20)],
      [expense('c1', ' alquiler ', 110)],
    )
    expect(rows.map((r) => [r.name, r.price, r.source])).toEqual([
      [' alquiler ', 110, 'actual'],
      ['Luz', 20, 'projected'],
    ])
  })

  it('matches duplicates one to one', () => {
    const rows = buildProjection(
      [expense('p1', 'Café', 5), expense('p2', 'Café', 5)],
      [expense('c1', 'Café', 6)],
    )
    expect(rows.filter((r) => r.source === 'projected')).toHaveLength(1)
  })
})

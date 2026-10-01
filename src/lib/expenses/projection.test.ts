import { describe, expect, it } from 'vitest'
import { buildProjection } from './projection'
import type { Expense } from './types'

function expense(categoryId: string, price: number): Expense {
  return {
    id: `${categoryId}-${String(price)}`,
    householdId: 'h',
    categoryId,
    memberId: 'm',
    authorDisplayName: 'A',
    name: 'x',
    price,
    comments: '',
    expenseDate: new Date(),
    pendienteId: null,
    isService: false,
    subcategory: null,
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
})

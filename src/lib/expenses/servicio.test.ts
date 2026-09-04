import { describe, expect, it } from 'vitest'
import { isServicio } from './servicio'
import type { Expense } from './types'

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'expense-1',
    householdId: 'hh-1',
    categoryId: 'cat-1',
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Pizza',
    price: 10,
    comments: '',
    expenseDate: new Date(2026, 7, 15),
    pendienteId: null,
    isService: false,
    createdAt: new Date(2026, 7, 15),
    ...overrides,
  }
}

describe('isServicio', () => {
  it('reads false for a plain expense with neither pendienteId nor isService', () => {
    expect(isServicio(makeExpense())).toBe(false)
  })

  it('reads true when pendienteId links to a real Pendiente', () => {
    expect(isServicio(makeExpense({ pendienteId: 'pendiente-1' }))).toBe(true)
  })

  it('reads true when isService is manually set, even with no pendienteId', () => {
    expect(isServicio(makeExpense({ isService: true }))).toBe(true)
  })

  it('reads true when both pendienteId and isService are set', () => {
    expect(
      isServicio(makeExpense({ pendienteId: 'pendiente-1', isService: true })),
    ).toBe(true)
  })
})

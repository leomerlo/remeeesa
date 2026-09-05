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

  // Per direct feedback: a one-off payment that happened to be tracked as a
  // Pendiente first (an Osde bill logged so it would not be forgotten) is an
  // ordinary Gasto once paid. The link alone says nothing about recurrence.
  it('reads false for a one-off bill, even though it came from a Pendiente', () => {
    expect(isServicio(makeExpense({ pendienteId: 'pendiente-1' }))).toBe(false)
  })

  it('reads true when the flag is set, with no Pendiente behind it', () => {
    // The manual "marcar como servicio" toggle, for an Expense logged
    // directly that should still count as one.
    expect(isServicio(makeExpense({ isService: true }))).toBe(true)
  })

  it('reads true for a recurring bill, which is flagged when it is paid', () => {
    expect(
      isServicio(makeExpense({ pendienteId: 'pendiente-1', isService: true })),
    ).toBe(true)
  })
})

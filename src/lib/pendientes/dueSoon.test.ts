import { describe, expect, it } from 'vitest'
import { pendientesDueSoon } from './dueSoon'
import type { Pendiente } from './types'

function pendiente(overrides: Partial<Pendiente>): Pendiente {
  return {
    id: 'pendiente-1',
    householdId: 'household-1',
    categoryId: 'category-1',
    name: 'Internet',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: 5000,
    recurring: true,
    status: 'pending',
    paidExpenseId: null,
    createdAt: new Date(2026, 7, 1),
    ...overrides,
  }
}

describe('pendientesDueSoon', () => {
  const now = new Date(2026, 8, 10, 9, 0, 0) // Sept 10, 2026, mid-morning

  it('includes a pendiente due today', () => {
    const dueToday = pendiente({ id: 'today', dueDate: new Date(2026, 8, 10) })
    expect(pendientesDueSoon([dueToday], now)).toEqual([dueToday])
  })

  it('includes a pendiente due up to 6 days from now', () => {
    const dueIn6Days = pendiente({
      id: 'in-6-days',
      dueDate: new Date(2026, 8, 16),
    })
    expect(pendientesDueSoon([dueIn6Days], now)).toEqual([dueIn6Days])
  })

  it('excludes a pendiente due 7 or more days from now', () => {
    const dueIn7Days = pendiente({
      id: 'in-7-days',
      dueDate: new Date(2026, 8, 17),
    })
    expect(pendientesDueSoon([dueIn7Days], now)).toEqual([])
  })

  it('excludes an already-overdue pendiente', () => {
    const overdue = pendiente({
      id: 'overdue',
      dueDate: new Date(2026, 8, 9),
    })
    expect(pendientesDueSoon([overdue], now)).toEqual([])
  })

  it('excludes a pendiente already marked paid, even if its due date is close', () => {
    const paid = pendiente({
      id: 'paid',
      dueDate: new Date(2026, 8, 11),
      status: 'paid',
      paidExpenseId: 'expense-1',
    })
    expect(pendientesDueSoon([paid], now)).toEqual([])
  })

  it('sorts the results soonest due date first', () => {
    const later = pendiente({ id: 'later', dueDate: new Date(2026, 8, 15) })
    const sooner = pendiente({ id: 'sooner', dueDate: new Date(2026, 8, 11) })
    expect(pendientesDueSoon([later, sooner], now)).toEqual([sooner, later])
  })

  it('returns an empty array when nothing is due soon', () => {
    expect(pendientesDueSoon([], now)).toEqual([])
  })
})

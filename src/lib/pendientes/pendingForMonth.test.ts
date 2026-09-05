import { describe, expect, it } from 'vitest'
import { pendientesDueInMonth } from './pendingForMonth'
import type { Pendiente } from './types'

function makePendiente(overrides: Partial<Pendiente> = {}): Pendiente {
  return {
    id: 'pendiente-1',
    householdId: 'hh-1',
    categoryId: 'cat-1',
    name: 'Internet',
    dueDate: new Date(2026, 8, 15),
    expectedAmount: 5000,
    recurring: false,
    autoDebit: false,
    status: 'pending',
    paidExpenseId: null,
    paidAt: null,
    createdAt: new Date(2026, 8, 1),
    ...overrides,
  }
}

const SEPTEMBER_START = new Date(2026, 8, 1)
const SEPTEMBER_END = new Date(2026, 8, 30, 23, 59, 59, 999)

describe('pendientesDueInMonth', () => {
  it('includes a pending pendiente due within the month', () => {
    const pendiente = makePendiente({ dueDate: new Date(2026, 8, 15) })
    expect(
      pendientesDueInMonth([pendiente], SEPTEMBER_START, SEPTEMBER_END),
    ).toEqual([pendiente])
  })

  it('excludes a pending pendiente due in a later month', () => {
    const pendiente = makePendiente({ dueDate: new Date(2026, 9, 4) })
    expect(
      pendientesDueInMonth([pendiente], SEPTEMBER_START, SEPTEMBER_END),
    ).toEqual([])
  })

  it('excludes a pending pendiente due in an earlier month', () => {
    const pendiente = makePendiente({ dueDate: new Date(2026, 7, 20) })
    expect(
      pendientesDueInMonth([pendiente], SEPTEMBER_START, SEPTEMBER_END),
    ).toEqual([])
  })

  it('includes a pendiente due on the exact first and last instants of the month', () => {
    const first = makePendiente({ id: 'p1', dueDate: SEPTEMBER_START })
    const last = makePendiente({ id: 'p2', dueDate: SEPTEMBER_END })
    expect(
      pendientesDueInMonth([first, last], SEPTEMBER_START, SEPTEMBER_END),
    ).toEqual([first, last])
  })

  it('excludes a paid pendiente even if its due date falls within the month', () => {
    const pendiente = makePendiente({
      dueDate: new Date(2026, 8, 15),
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 15),
    })
    expect(
      pendientesDueInMonth([pendiente], SEPTEMBER_START, SEPTEMBER_END),
    ).toEqual([])
  })
})

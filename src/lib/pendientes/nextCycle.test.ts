import { describe, expect, it } from 'vitest'
import {
  isNextCycleAfterAPaidThisPeriod,
  isSupersededByNextCycle,
} from './nextCycle'
import type { Pendiente } from './types'

function pendiente(overrides: Partial<Pendiente>): Pendiente {
  return {
    id: 'pendiente-1',
    householdId: 'household-1',
    categoryId: 'category-1',
    name: 'Gimnasio',
    dueDate: new Date(2026, 9, 10),
    expectedAmount: 8000,
    recurring: true,
    status: 'pending',
    paidExpenseId: null,
    paidAt: null,
    createdAt: new Date(2026, 8, 10),
    ...overrides,
  }
}

describe('isNextCycleAfterAPaidThisPeriod', () => {
  it('is true for a recurring pending pendiente whose series has a paid sibling in the same list', () => {
    const nextCycle = pendiente({ id: 'next', status: 'pending' })
    const paidThisMonth = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(
      isNextCycleAfterAPaidThisPeriod(nextCycle, [nextCycle, paidThisMonth]),
    ).toBe(true)
  })

  it('matches the name case- and whitespace-insensitively', () => {
    const nextCycle = pendiente({ id: 'next', name: '  gimnasio  ' })
    const paidThisMonth = pendiente({
      id: 'paid',
      name: 'GIMNASIO',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(
      isNextCycleAfterAPaidThisPeriod(nextCycle, [nextCycle, paidThisMonth]),
    ).toBe(true)
  })

  it('is false when nothing in the list has been paid', () => {
    const pending = pendiente({ id: 'pending' })

    expect(isNextCycleAfterAPaidThisPeriod(pending, [pending])).toBe(false)
  })

  it('is false for a non-recurring pendiente, even with a paid same-name sibling', () => {
    const oneOff = pendiente({ id: 'one-off', recurring: false })
    const paidThisMonth = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(
      isNextCycleAfterAPaidThisPeriod(oneOff, [oneOff, paidThisMonth]),
    ).toBe(false)
  })

  it('is false for an already-paid pendiente itself', () => {
    const paid = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(isNextCycleAfterAPaidThisPeriod(paid, [paid])).toBe(false)
  })

  it('is false when the paid sibling belongs to a different-named series', () => {
    const nextCycle = pendiente({ id: 'next', name: 'Gimnasio' })
    const unrelatedPaid = pendiente({
      id: 'paid',
      name: 'Netflix',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(
      isNextCycleAfterAPaidThisPeriod(nextCycle, [nextCycle, unrelatedPaid]),
    ).toBe(false)
  })
})

describe('isSupersededByNextCycle', () => {
  it('is true for a paid pendiente whose recurring next cycle is already in the same list', () => {
    const paid = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })
    const nextCycle = pendiente({ id: 'next', status: 'pending' })

    expect(isSupersededByNextCycle(paid, [paid, nextCycle])).toBe(true)
  })

  it('is false for a paid pendiente with no next cycle in the list', () => {
    const paid = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })

    expect(isSupersededByNextCycle(paid, [paid])).toBe(false)
  })

  it('is false for a pending pendiente (only a paid one can be superseded)', () => {
    const pending = pendiente({ id: 'pending' })
    const otherPending = pendiente({ id: 'other', name: 'Gimnasio' })

    expect(isSupersededByNextCycle(pending, [pending, otherPending])).toBe(
      false,
    )
  })

  it('is false when the pending sibling is not recurring', () => {
    const paid = pendiente({
      id: 'paid',
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 8, 5),
    })
    const oneOffSibling = pendiente({ id: 'one-off', recurring: false })

    expect(isSupersededByNextCycle(paid, [paid, oneOffSibling])).toBe(false)
  })
})

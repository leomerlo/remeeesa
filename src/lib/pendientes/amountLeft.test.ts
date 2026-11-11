import { describe, expect, it } from 'vitest'
import { amountLeft, isPartlyPaid, paidSoFar } from './amountLeft'
import type { Pendiente } from './types'

function pendiente(overrides: Partial<Pendiente>): Pendiente {
  return {
    id: 'pendiente-1',
    householdId: 'household-1',
    categoryId: 'category-1',
    name: 'Luz',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: 100000,
    recurring: true,
    autoDebit: false,
    status: 'pending',
    paidExpenseId: null,
    paidAt: null,
    createdAt: new Date(2026, 7, 1),
    ...overrides,
  }
}

describe('amountLeft', () => {
  it('owes the whole figure while nothing has been handed over', () => {
    expect(amountLeft(pendiente({}))).toBe(100000)
  })

  it('takes off what has already been handed over', () => {
    expect(amountLeft(pendiente({ paidSoFar: 40000 }))).toBe(60000)
  })

  it('owes nothing once the bill is paid', () => {
    expect(
      amountLeft(
        pendiente({
          status: 'paid',
          paidExpenseId: 'expense-1',
          paidSoFar: 40000,
        }),
      ),
    ).toBe(0)
  })

  it('owes nothing knowable while the figure has not arrived', () => {
    expect(amountLeft(pendiente({ expectedAmount: null }))).toBeNull()
  })

  it('still owes nothing knowable when part was handed over before the figure', () => {
    expect(
      amountLeft(pendiente({ expectedAmount: null, paidSoFar: 40000 })),
    ).toBeNull()
  })

  it('never owes a negative amount when more was handed over than the bill said', () => {
    expect(
      amountLeft(pendiente({ expectedAmount: 100000, paidSoFar: 120000 })),
    ).toBe(0)
  })
})

describe('paidSoFar', () => {
  it('is zero on a bill nobody has part-paid', () => {
    expect(paidSoFar(pendiente({}))).toBe(0)
  })

  it('is what has been handed over', () => {
    expect(paidSoFar(pendiente({ paidSoFar: 40000 }))).toBe(40000)
  })
})

describe('isPartlyPaid', () => {
  it('is false on a bill nobody has touched', () => {
    expect(isPartlyPaid(pendiente({}))).toBe(false)
  })

  it('is true on a bill waiting for the rest', () => {
    expect(isPartlyPaid(pendiente({ paidSoFar: 40000 }))).toBe(true)
  })

  it('is false once the bill is settled', () => {
    expect(
      isPartlyPaid(
        pendiente({
          status: 'paid',
          paidExpenseId: 'expense-1',
          paidSoFar: 40000,
        }),
      ),
    ).toBe(false)
  })
})

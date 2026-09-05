import { describe, expect, it } from 'vitest'
import type { Pendiente } from './types'
import { autoDebitsToSettle } from './autoDebit'

function pendiente(overrides: Partial<Pendiente>): Pendiente {
  return {
    id: 'p1',
    householdId: 'h1',
    categoryId: 'c1',
    name: 'Netflix',
    dueDate: new Date(2026, 8, 1),
    expectedAmount: 5000,
    recurring: true,
    autoDebit: true,
    status: 'pending',
    paidExpenseId: null,
    paidAt: null,
    createdAt: new Date(2026, 7, 1),
    ...overrides,
  }
}

const now = new Date(2026, 8, 4)

describe('autoDebitsToSettle', () => {
  it('settles an auto-debit bill once its date has passed', () => {
    const due = pendiente({})
    expect(autoDebitsToSettle([due], now)).toEqual([due])
  })

  it('leaves a bill the household pays itself alone', () => {
    expect(autoDebitsToSettle([pendiente({ autoDebit: false })], now)).toEqual(
      [],
    )
  })

  it('waits until the date actually passes', () => {
    // The bank has not taken it yet, so neither does the app.
    expect(
      autoDebitsToSettle([pendiente({ dueDate: new Date(2026, 8, 20) })], now),
    ).toEqual([])
  })

  it('does not touch one due today', () => {
    expect(
      autoDebitsToSettle([pendiente({ dueDate: new Date(2026, 8, 4) })], now),
    ).toEqual([])
  })

  it('leaves an already-settled bill alone', () => {
    expect(autoDebitsToSettle([pendiente({ status: 'paid' })], now)).toEqual([])
  })

  it('will not invent an amount for a bill that has none yet', () => {
    // Nothing to record. It stays in "Por pagar" with its badge until
    // someone fills the figure in.
    expect(
      autoDebitsToSettle([pendiente({ expectedAmount: null })], now),
    ).toEqual([])
  })

  it('catches up every cycle the bank already took', () => {
    // Two months unopened: the bank debited twice, so both are owed to the
    // record, not just the most recent.
    const older = pendiente({ id: 'p0', dueDate: new Date(2026, 6, 1) })
    const newer = pendiente({ id: 'p1', dueDate: new Date(2026, 7, 1) })
    expect(autoDebitsToSettle([older, newer], now)).toEqual([older, newer])
  })
})

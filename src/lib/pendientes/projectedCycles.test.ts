import { describe, expect, it } from 'vitest'
import { currentMonthRange } from '@/lib/expenses'
import {
  pendingForMonthWithProjections,
  projectRecurringCycles,
} from './projectedCycles'
import type { Pendiente } from './types'

function bill(overrides: Partial<Pendiente> = {}): Pendiente {
  return {
    id: 'p1',
    householdId: 'h1',
    categoryId: 'c1',
    name: 'Seguro vivienda',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: 50000,
    recurring: true,
    autoDebit: false,
    status: 'pending',
    paidExpenseId: null,
    paidAt: null,
    createdAt: new Date(2026, 8, 1),
    ...overrides,
  }
}

const OCTOBER = currentMonthRange(new Date(2026, 9, 1))
const NOVEMBER = currentMonthRange(new Date(2026, 10, 1))
const SEPTEMBER = currentMonthRange(new Date(2026, 8, 1))
const AUGUST = currentMonthRange(new Date(2026, 7, 1))

describe('projectRecurringCycles', () => {
  it('shows an unpaid recurring bill in the month it will come due next', () => {
    const projected = projectRecurringCycles(
      [bill()],
      OCTOBER.monthStart,
      OCTOBER.monthEnd,
    )

    expect(projected).toHaveLength(1)
    expect(projected[0]?.dueDate).toEqual(new Date(2026, 9, 10))
    expect(projected[0]?.projected).toBe(true)
    expect(projected[0]?.name).toBe('Seguro vivienda')
  })

  it('keeps going for months further out, one cycle per month', () => {
    const november = projectRecurringCycles(
      [bill()],
      NOVEMBER.monthStart,
      NOVEMBER.monthEnd,
    )

    expect(november).toHaveLength(1)
    expect(november[0]?.dueDate).toEqual(new Date(2026, 10, 10))
  })

  it('gives the projection an id of its own, so it cannot be mistaken for the record', () => {
    const [projected] = projectRecurringCycles(
      [bill()],
      OCTOBER.monthStart,
      OCTOBER.monthEnd,
    )

    expect(projected?.id).not.toBe('p1')
    expect(projected?.id).toContain('p1')
  })

  it("never projects into the bill's own month", () => {
    expect(
      projectRecurringCycles(
        [bill()],
        SEPTEMBER.monthStart,
        SEPTEMBER.monthEnd,
      ),
    ).toEqual([])
  })

  // Otherwise a past month would be handed spending that never happened.
  it('never projects backwards', () => {
    expect(
      projectRecurringCycles([bill()], AUGUST.monthStart, AUGUST.monthEnd),
    ).toEqual([])
  })

  it('projects nothing from a one-off bill', () => {
    expect(
      projectRecurringCycles(
        [bill({ recurring: false })],
        OCTOBER.monthStart,
        OCTOBER.monthEnd,
      ),
    ).toEqual([])
  })

  // Paying it is what writes the real next cycle; projecting from a paid one
  // too would put that cycle in the month twice.
  it('projects nothing from a bill that has been paid', () => {
    expect(
      projectRecurringCycles(
        [bill({ status: 'paid', paidAt: new Date(2026, 8, 10) })],
        OCTOBER.monthStart,
        OCTOBER.monthEnd,
      ),
    ).toEqual([])
  })

  it('follows the same end-of-month clamp the real cycles use', () => {
    const january = bill({ dueDate: new Date(2026, 0, 31) })
    const february = currentMonthRange(new Date(2026, 1, 1))

    const [projected] = projectRecurringCycles(
      [january],
      february.monthStart,
      february.monthEnd,
    )

    expect(projected?.dueDate).toEqual(new Date(2026, 1, 28))
  })

  it('carries the amount and the auto-debit flag over, so the month costs what it will cost', () => {
    const [projected] = projectRecurringCycles(
      [bill({ autoDebit: true, expectedAmount: 42000 })],
      OCTOBER.monthStart,
      OCTOBER.monthEnd,
    )

    expect(projected?.expectedAmount).toBe(42000)
    expect(projected?.autoDebit).toBe(true)
  })
})

describe('pendingForMonthWithProjections', () => {
  it('lists the real record for the month it is actually due in, unprojected', () => {
    const forMonth = pendingForMonthWithProjections(
      [bill()],
      SEPTEMBER.monthStart,
      SEPTEMBER.monthEnd,
    )

    expect(forMonth).toHaveLength(1)
    expect(forMonth[0]?.id).toBe('p1')
    expect(forMonth[0]?.projected).toBe(false)
  })

  it('does not double up once the real next cycle exists', () => {
    // What the database looks like the moment September's bill is paid.
    const septemberPaid = bill({
      status: 'paid',
      paidAt: new Date(2026, 8, 10),
    })
    const octoberReal = bill({ id: 'p2', dueDate: new Date(2026, 9, 10) })

    const october = pendingForMonthWithProjections(
      [septemberPaid, octoberReal],
      OCTOBER.monthStart,
      OCTOBER.monthEnd,
    )

    expect(october.map((entry) => entry.id)).toEqual(['p2'])
    expect(october[0]?.projected).toBe(false)
  })

  it('puts anything actionable before the previews', () => {
    const octoberOneOff = bill({
      id: 'p3',
      name: 'Patente',
      recurring: false,
      dueDate: new Date(2026, 9, 5),
    })

    const october = pendingForMonthWithProjections(
      [bill(), octoberOneOff],
      OCTOBER.monthStart,
      OCTOBER.monthEnd,
    )

    expect(october.map((entry) => entry.projected)).toEqual([false, true])
  })
})

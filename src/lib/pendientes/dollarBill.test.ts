import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  computeMonthTotalIn,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import {
  carryRecurrentes,
  createPendiente,
  listPendientes,
  markPendientePaid,
  updatePendiente,
} from './pendientes'

// A bill can be in dollars -- a subscription, something billed abroad.
// Recorded and shown in dollars, counted against no peso budget, exactly
// like a dollar gasto. Per direct feedback: this was the top of the list.

const DUE = new Date(2026, 7, 10, 12)
const AUGUST = {
  monthStart: new Date(2026, 7, 1),
  monthEnd: new Date(2026, 8, 1),
}

async function setUp(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 500000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

describe('a bill in dollars', () => {
  it('is created, stored and read back in dollars', async () => {
    const { db, householdId, categoryId } = await setUp()

    const created = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Skool',
      dueDate: DUE,
      expectedAmount: 97,
      currency: 'USD',
    })

    expect(created.currency).toBe('USD')
    expect((await listPendientes({ db, householdId }))[0]?.currency).toBe('USD')
  })

  it('commits no pesos while it is owed', async () => {
    const { db, householdId, categoryId } = await setUp()
    await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Skool',
      dueDate: DUE,
      expectedAmount: 97,
      currency: 'USD',
    })
    await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Luz',
      dueDate: DUE,
      expectedAmount: 36800,
    })

    const pendientes = await listPendientes({ db, householdId })
    // The peso month owes the peso bill and nothing else...
    expect(
      computeMonthTotalIn({ expenses: [], pendientes, currency: 'ARS' }),
    ).toBe(36800)
    // ...and the dollars are their own figure, never added to those pesos.
    expect(
      computeMonthTotalIn({ expenses: [], pendientes, currency: 'USD' }),
    ).toBe(97)
  })

  it('is paid in dollars: the gasto it writes is a dollar gasto', async () => {
    const { db, householdId, categoryId } = await setUp()
    const bill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Skool',
      dueDate: DUE,
      expectedAmount: 97,
      currency: 'USD',
    })

    const { expense } = await markPendientePaid({
      db,
      householdId,
      pendienteId: bill.id,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 97,
      paymentDate: DUE,
    })

    expect(expense.currency).toBe('USD')
    const expenses = await listExpensesInMonth({ db, householdId, ...AUGUST })
    expect(expenses).toEqual([
      expect.objectContaining({ price: 97, currency: 'USD' }),
    ])
    // Paying it still commits no pesos.
    expect(
      computeMonthTotalIn({ expenses, pendientes: [], currency: 'ARS' }),
    ).toBe(0)
  })

  it('stays a dollar bill when it is carried into next month', async () => {
    const { db, householdId, categoryId } = await setUp()
    const bill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Skool',
      dueDate: DUE,
      expectedAmount: 97,
      recurring: true,
      currency: 'USD',
    })

    const [carried] = await carryRecurrentes({
      db,
      householdId,
      pendientes: [bill],
    })

    expect(carried).toEqual(
      expect.objectContaining({
        name: 'Skool',
        expectedAmount: 97,
        currency: 'USD',
        recurring: true,
      }),
    )
  })

  it('can be corrected to the other currency, like a gasto can', async () => {
    const { db, householdId, categoryId } = await setUp()
    const bill = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Skool',
      dueDate: DUE,
      expectedAmount: 97,
    })
    expect(bill.currency).toBe('ARS')

    const fixed = await updatePendiente({
      db,
      householdId,
      pendienteId: bill.id,
      currency: 'USD',
    })

    expect(fixed.currency).toBe('USD')
    // Nothing else moved.
    expect(fixed.name).toBe('Skool')
    expect(fixed.expectedAmount).toBe(97)
  })
})

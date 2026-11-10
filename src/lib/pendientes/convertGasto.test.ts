import { describe, expect, it } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  createExpense,
  ExpenseNotFoundError,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import type { Currency } from '@/lib/money'
import {
  convertExpenseToPendiente,
  GastoAlreadyServicioError,
} from './convertGasto'
import { createPendiente, getPendiente, markPendientePaid } from './pendientes'

// A fixed day in the past: createExpense refuses a future date, and a
// hardcoded past one keeps these deterministic without faking the clock.
const MONTH_START = new Date(2026, 7, 1)
const MONTH_END = new Date(2026, 8, 1)
const SPENT_ON = new Date(2026, 7, 12, 12)

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
    monthlyBudget: 100000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

async function seedGasto(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly currency?: Currency
  readonly comments?: string
  readonly paymentMethodId?: string | null
}): Promise<string> {
  const expense = await createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Gimnasio',
    price: 12000,
    comments: input.comments ?? '',
    expenseDate: SPENT_ON,
    currency: input.currency,
    paymentMethodId: input.paymentMethodId,
  })
  return expense.id
}

describe('convertExpenseToPendiente', () => {
  it('rebuilds a paid gasto as a paid, recurring Pendiente, spending the money exactly once', async () => {
    const { db, householdId, categoryId } = await setUp()
    const expenseId = await seedGasto({ db, householdId, categoryId })

    const created = await convertExpenseToPendiente({
      db,
      householdId,
      expenseId,
      recurring: true,
      autoDebit: true,
      markPaid: true,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
    })

    expect(created).toEqual(
      expect.objectContaining({
        name: 'Gimnasio',
        expectedAmount: 12000,
        dueDate: SPENT_ON,
        recurring: true,
        autoDebit: true,
      }),
    )
    const reloaded = await getPendiente({
      db,
      householdId,
      pendienteId: created.id,
    })
    expect(reloaded?.status).toBe('paid')

    const expenses = await listExpensesInMonth({
      db,
      householdId,
      monthStart: MONTH_START,
      monthEnd: MONTH_END,
    })
    expect(expenses).toHaveLength(1)
    expect(expenses[0]).toEqual(
      expect.objectContaining({ price: 12000, pendienteId: created.id }),
    )
    // The old, standalone record is gone -- not left beside the new one.
    expect(expenses[0]?.id).not.toBe(expenseId)
  })

  it('carries the comment and the payment method onto the Expense the payment creates', async () => {
    const { db, householdId, categoryId } = await setUp()
    const card = await db.createCard({
      householdId,
      name: 'Débito Galicia',
      kind: 'debito',
      currency: 'ARS',
      brand: 'visa',
    })
    const expenseId = await seedGasto({
      db,
      householdId,
      categoryId,
      comments: 'Cuota del año',
      paymentMethodId: card.id,
    })

    await convertExpenseToPendiente({
      db,
      householdId,
      expenseId,
      recurring: true,
      autoDebit: false,
      markPaid: true,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
    })

    const [converted] = await listExpensesInMonth({
      db,
      householdId,
      monthStart: MONTH_START,
      monthEnd: MONTH_END,
    })
    expect(converted).toEqual(
      expect.objectContaining({
        comments: 'Cuota del año',
        paymentMethodId: card.id,
      }),
    )
  })

  it('leaves a bill still owed, and no gasto, when the payment is taken back', async () => {
    const { db, householdId, categoryId } = await setUp()
    const expenseId = await seedGasto({ db, householdId, categoryId })

    const created = await convertExpenseToPendiente({
      db,
      householdId,
      expenseId,
      recurring: false,
      autoDebit: false,
      markPaid: false,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
    })

    expect(created.status).toBe('pending')
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        monthStart: MONTH_START,
        monthEnd: MONTH_END,
      }),
    ).toEqual([])
  })

  // This used to be refused outright: a Pendiente had no currency of its
  // own, so US$120 would have become $120 of this month's budget. Bills
  // carry a currency now. Per direct feedback -- dollars first.
  it('turns a dollar gasto into a dollar bill, counted against no peso budget', async () => {
    const { db, householdId, categoryId } = await setUp()
    const expenseId = await seedGasto({
      db,
      householdId,
      categoryId,
      currency: 'USD',
    })

    const created = await convertExpenseToPendiente({
      db,
      householdId,
      expenseId,
      recurring: true,
      autoDebit: false,
      markPaid: true,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
    })

    expect(created.currency).toBe('USD')
    const [converted] = await listExpensesInMonth({
      db,
      householdId,
      monthStart: MONTH_START,
      monthEnd: MONTH_END,
    })
    // The gasto the payment wrote is in dollars too, not quietly in pesos.
    expect(converted?.currency).toBe('USD')
    expect(converted?.price).toBe(12000)
  })

  it('refuses a gasto that already has a Pendiente behind it', async () => {
    const { db, householdId, categoryId } = await setUp()
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dueDate: SPENT_ON,
      expectedAmount: 5000,
    })
    const { expense } = await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: SPENT_ON,
    })

    await expect(
      convertExpenseToPendiente({
        db,
        householdId,
        expenseId: expense.id,
        recurring: true,
        autoDebit: false,
        markPaid: true,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
      }),
    ).rejects.toThrow(GastoAlreadyServicioError)
  })

  it('reports a gasto that is no longer there', async () => {
    const { db, householdId } = await setUp()

    await expect(
      convertExpenseToPendiente({
        db,
        householdId,
        expenseId: 'gone',
        recurring: true,
        autoDebit: false,
        markPaid: true,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
      }),
    ).rejects.toThrow(ExpenseNotFoundError)
  })
})

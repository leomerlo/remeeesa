import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listCategories, listRecentExpenses } from '@/lib/expenses/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { amountLeft } from './amountLeft'
import {
  createPendiente,
  getPendiente,
  markPendientePaid,
  PartialPaymentCoversBillError,
  PendienteAmountUnknownError,
  PendienteNotPartlyPaidError,
  payPendientePartially,
  undoLastPartialPayment,
} from './pendientes'

async function household(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const made = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 500000,
  })
  const categories = await listCategories({ db, householdId: made.id })
  const servicios = categories[0]
  if (servicios === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: made.id, categoryId: servicios.id }
}

async function luz(amount: number | null = 100000): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
}> {
  const { db, householdId, categoryId } = await household()
  const bill = await createPendiente({
    db,
    householdId,
    categoryId,
    name: 'Luz',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: amount,
    recurring: true,
  })
  return { db, householdId, pendienteId: bill.id }
}

const paying = {
  memberId: 'user-1',
  authorDisplayName: 'Flor',
  paymentDate: new Date(2026, 8, 5),
}

describe('payPendientePartially', () => {
  it('leaves the bill pending, owing the rest', async () => {
    const { db, householdId, pendienteId } = await luz()

    const { pendiente } = await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })

    expect(pendiente.status).toBe('pending')
    expect(pendiente.paidSoFar).toBe(40000)
    expect(amountLeft(pendiente)).toBe(60000)
  })

  it('writes the money that left as a gasto of its own', async () => {
    const { db, householdId, pendienteId } = await luz()

    const { expense } = await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })

    expect(expense.price).toBe(40000)
    expect(expense.name).toBe('Luz')
    expect(expense.pendienteId).toBe(pendienteId)
    const logged = await listRecentExpenses({ db, householdId, limit: 10 })
    expect(logged.map((one) => one.price)).toEqual([40000])
  })

  it('adds up across several payments', async () => {
    const { db, householdId, pendienteId } = await luz()

    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })
    const { pendiente } = await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 25000,
      ...paying,
    })

    expect(pendiente.paidSoFar).toBe(65000)
    expect(amountLeft(pendiente)).toBe(35000)
    expect(pendiente.partialExpenseIds).toHaveLength(2)
  })

  it('refuses to hand over everything the bill still owes', async () => {
    const { db, householdId, pendienteId } = await luz()
    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })

    await expect(
      payPendientePartially({
        db,
        householdId,
        pendienteId,
        amount: 60000,
        ...paying,
      }),
    ).rejects.toBeInstanceOf(PartialPaymentCoversBillError)
  })

  it('refuses a bill whose figure has not arrived', async () => {
    const { db, householdId, pendienteId } = await luz(null)

    await expect(
      payPendientePartially({
        db,
        householdId,
        pendienteId,
        amount: 40000,
        ...paying,
      }),
    ).rejects.toBeInstanceOf(PendienteAmountUnknownError)
  })

  it('settles the bill when the rest is finally paid, keeping both gastos', async () => {
    const { db, householdId, pendienteId } = await luz()
    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })

    const { pendiente } = await markPendientePaid({
      db,
      householdId,
      pendienteId,
      finalAmount: 60000,
      ...paying,
    })

    expect(pendiente.status).toBe('paid')
    expect(amountLeft(pendiente)).toBe(0)
    const logged = await listRecentExpenses({ db, householdId, limit: 10 })
    expect(logged.map((one) => one.price).sort((a, b) => a - b)).toEqual([
      40000, 60000,
    ])
  })
})

describe('undoLastPartialPayment', () => {
  it('gives the bill back what the last payment took off', async () => {
    const { db, householdId, pendienteId } = await luz()
    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })
    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 25000,
      ...paying,
    })

    const pendiente = await undoLastPartialPayment({
      db,
      householdId,
      pendienteId,
    })

    expect(pendiente.paidSoFar).toBe(40000)
    expect(amountLeft(pendiente)).toBe(60000)
  })

  it('deletes the gasto that payment had written', async () => {
    const { db, householdId, pendienteId } = await luz()
    await payPendientePartially({
      db,
      householdId,
      pendienteId,
      amount: 40000,
      ...paying,
    })

    await undoLastPartialPayment({ db, householdId, pendienteId })

    const logged = await listRecentExpenses({ db, householdId, limit: 10 })
    expect(logged).toEqual([])
    const bill = await getPendiente({ db, householdId, pendienteId })
    expect(bill?.paidSoFar).toBe(0)
    expect(bill?.partialExpenseIds).toEqual([])
  })

  it('refuses a bill nobody has part-paid', async () => {
    const { db, householdId, pendienteId } = await luz()

    await expect(
      undoLastPartialPayment({ db, householdId, pendienteId }),
    ).rejects.toBeInstanceOf(PendienteNotPartlyPaidError)
  })
})

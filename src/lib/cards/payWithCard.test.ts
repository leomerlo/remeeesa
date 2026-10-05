import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import {
  createPendiente,
  getPendiente,
  unmarkPendientePaid,
} from '@/lib/pendientes'
import { createCard } from './cards'
import {
  cardsDueNextMonth,
  listResumenCuotas,
  markPendientePaidWithCard,
  markResumenPaid,
  setResumenAmount,
} from './purchases'

// Paying a bill with a credit card. The money does not leave the household
// today: the bill goes onto the card and arrives in that card's Resumen.
// Per direct feedback -- "pagar la Luz con la Visa".

const TODAY = new Date(2026, 8, 20, 12)
const SEPTEMBER = {
  monthStart: new Date(2026, 8, 1),
  monthEnd: new Date(2026, 9, 1),
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
})

async function setup(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly pendienteId: string
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 500000,
  })
  const householdId = household.id
  const categories = await listCategories({ db, householdId })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  const card = await createCard({
    db,
    householdId,
    name: 'Visa Flor',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  const pendiente = await createPendiente({
    db,
    householdId,
    categoryId: category.id,
    name: 'Luz',
    dueDate: new Date(2026, 8, 18),
    expectedAmount: 36800,
    recurring: true,
  })
  return { db, householdId, cardId: card.id, pendienteId: pendiente.id }
}

describe('markPendientePaidWithCard', () => {
  it('settles the bill without spending anything this month', async () => {
    const { db, householdId, cardId, pendienteId } = await setup()

    const { pendiente, purchase } = await markPendientePaidWithCard({
      db,
      householdId,
      pendienteId,
      cardId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 36800,
      cuotas: 1,
      paymentDate: TODAY,
    })

    expect(pendiente.status).toBe('paid')
    // The link is to the purchase, not to an Expense -- there is none.
    expect(pendiente.paidExpenseId).toBeNull()
    expect(pendiente.paidPurchaseId).toBe(purchase.id)
    expect(
      await listExpensesInMonth({ db, householdId, ...SEPTEMBER }),
    ).toEqual([])
    // It keeps the bill's own name and category, so it reads as what it is
    // inside the Resumen.
    expect(purchase).toEqual(
      expect.objectContaining({ name: 'Luz', total: 36800, cuotas: 1 }),
    )
  })

  it("lands in next month's Resumen for that card, alongside other consumos", async () => {
    const { db, householdId, cardId, pendienteId } = await setup()

    await markPendientePaidWithCard({
      db,
      householdId,
      pendienteId,
      cardId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 36800,
      cuotas: 1,
      paymentDate: TODAY,
    })

    const [resumen] = cardsDueNextMonth(
      await db.listPendientes({ householdId }),
      TODAY,
    )
    if (resumen === undefined) {
      throw new Error('expected a Resumen due next month')
    }
    expect(resumen.estimatedAmount).toBe(36800)
    const cuotas = await listResumenCuotas({ db, householdId, resumen })
    expect(cuotas.map(({ purchase }) => purchase.name)).toEqual(['Luz'])
  })

  it('splits into cuotas, each in the month it falls due', async () => {
    const { db, householdId, cardId, pendienteId } = await setup()

    await markPendientePaidWithCard({
      db,
      householdId,
      pendienteId,
      cardId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 36000,
      cuotas: 3,
      paymentDate: TODAY,
    })

    const resumenes = (await db.listPendientes({ householdId })).filter(
      (candidate) => candidate.cardId !== undefined,
    )
    expect(resumenes).toHaveLength(3)
    expect(resumenes.map((r) => r.estimatedAmount)).toEqual([
      12000, 12000, 12000,
    ])
  })

  it('undoing the payment takes the consumo back out of the Resumen', async () => {
    const { db, householdId, cardId, pendienteId } = await setup()
    await markPendientePaidWithCard({
      db,
      householdId,
      pendienteId,
      cardId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 36800,
      cuotas: 1,
      paymentDate: TODAY,
    })

    const back = await unmarkPendientePaid({ db, householdId, pendienteId })

    expect(back.status).toBe('pending')
    expect(back.paidPurchaseId ?? null).toBeNull()
    // The Resumen it was the only consumo of is gone with it.
    expect(
      (await db.listPendientes({ householdId })).filter(
        (candidate) => candidate.cardId !== undefined,
      ),
    ).toEqual([])
    expect(
      await db.listCardPurchasesInMonth({ householdId, ...SEPTEMBER }),
    ).toEqual([])
  })

  it('refuses to undo once that Resumen has itself been paid', async () => {
    const { db, householdId, cardId, pendienteId } = await setup()
    await markPendientePaidWithCard({
      db,
      householdId,
      pendienteId,
      cardId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: 36800,
      cuotas: 1,
      // August, so its one cuota lands in September's Resumen, which today
      // (the 20th) is already payable.
      paymentDate: new Date(2026, 7, 18, 12),
    })
    const [resumen] = (await db.listPendientes({ householdId })).filter(
      (candidate) => candidate.cardId !== undefined,
    )
    if (resumen === undefined) {
      throw new Error('expected a Resumen')
    }
    await setResumenAmount({
      db,
      householdId,
      resumenId: resumen.id,
      amount: 36800,
    })
    await markResumenPaid({
      db,
      householdId,
      resumenId: resumen.id,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      amountPaid: 36800,
      paymentDate: TODAY,
    })

    // The money has actually gone now, through the Resumen. Undoing the
    // bill's payment would have to unpick that too, so it refuses instead.
    await expect(
      unmarkPendientePaid({ db, householdId, pendienteId }),
    ).rejects.toThrow()
    expect((await getPendiente({ db, householdId, pendienteId }))?.status).toBe(
      'paid',
    )
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listCategories } from '@/lib/expenses'
import { createCard, createCardPurchase } from '@/lib/cards'
import {
  carryRecurrentes,
  createPendiente,
  listRecurrentesToCarry,
  markPendientePaid,
} from './pendientes'

// "Traer del mes pasado", seen from the month you are standing in. Carrying
// is a deliberate step rather than something that happens on payment -- per
// direct feedback, doing it automatically doubled a bill every time a
// payment was undone and redone.

const VIEWED = new Date(2026, 10, 1) // noviembre
const LAST_MONTH = new Date(2026, 9, 17) // octubre

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 6, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

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
    monthlyBudget: 1000000,
  })
  const [category] = await listCategories({ db, householdId: household.id })
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

async function bill(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly amount: number
  readonly recurring: boolean
  readonly paid?: boolean
}) {
  const created = await createPendiente({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: input.name,
    dueDate: LAST_MONTH,
    expectedAmount: input.amount,
    recurring: input.recurring,
  })
  if (input.paid === true) {
    await markPendientePaid({
      db: input.db,
      householdId: input.householdId,
      pendienteId: created.id,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: input.amount,
      paymentDate: LAST_MONTH,
    })
  }
  return created
}

describe('listRecurrentesToCarry', () => {
  // The common case, and the one worth pinning: by November the bill has
  // been paid, so it is no longer among the pending ones and has to be
  // found among last month's settled ones.
  it('offers a recurring bill from last month even though it was paid', async () => {
    const s = await setUp()
    await bill({
      ...s,
      name: 'Luz',
      amount: 36800,
      recurring: true,
      paid: true,
    })

    const rows = await listRecurrentesToCarry({
      db: s.db,
      householdId: s.householdId,
      monthStart: VIEWED,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.pendiente.name).toBe('Luz')
    // Last month's figure comes with it; adjusting it is the member's job.
    expect(rows[0]?.pendiente.expectedAmount).toBe(36800)
    expect(rows[0]?.alreadyThere).toBe(false)
  })

  it('offers one that is still unpaid too', async () => {
    const s = await setUp()
    await bill({ ...s, name: 'Internet', amount: 42000, recurring: true })

    expect(
      await listRecurrentesToCarry({
        db: s.db,
        householdId: s.householdId,
        monthStart: VIEWED,
      }),
    ).toHaveLength(1)
  })

  // It used to list only the bills flagged recurring, which is set a month
  // earlier with the toggle off by default -- so a household that logged
  // its Luz without noticing opened this sheet and found it empty, and the
  // one screen that would have fixed it was the one that could not see it.
  // Per direct feedback: en noviembre no me está marcando nada de octubre.
  it('offers one that was never marked recurring, for the member to decide', async () => {
    const s = await setUp()
    await bill({
      ...s,
      name: 'Gas',
      amount: 31500,
      recurring: false,
      paid: true,
    })

    const rows = await listRecurrentesToCarry({
      db: s.db,
      householdId: s.householdId,
      monthStart: VIEWED,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.pendiente.name).toBe('Gas')
    // The screen uses this to leave it unticked: offered, not assumed.
    expect(rows[0]?.pendiente.recurring).toBe(false)
  })

  // A card's Resumen is not written down by anyone -- it is rebuilt each
  // month from the purchases that land in it -- so carrying one forward
  // would invent a bill nobody owes.
  it('never offers a card Resumen', async () => {
    const s = await setUp()
    await bill({
      ...s,
      name: 'Luz',
      amount: 36800,
      recurring: true,
      paid: true,
    })
    const card = await createCard({
      db: s.db,
      householdId: s.householdId,
      name: 'Visa',
    })
    await createCardPurchase({
      db: s.db,
      householdId: s.householdId,
      cardId: card.id,
      categoryId: s.categoryId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      name: 'Zapatillas',
      total: 90000,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 20),
      comments: '',
    })

    const rows = await listRecurrentesToCarry({
      db: s.db,
      householdId: s.householdId,
      monthStart: VIEWED,
    })

    expect(rows.map((row) => row.pendiente.name)).toEqual(['Luz'])
  })

  it('marks one already in the viewed month rather than offering it twice', async () => {
    const s = await setUp()
    await bill({
      ...s,
      name: 'Luz',
      amount: 36800,
      recurring: true,
      paid: true,
    })
    await createPendiente({
      db: s.db,
      householdId: s.householdId,
      categoryId: s.categoryId,
      name: 'Luz',
      dueDate: new Date(2026, 10, 17),
      expectedAmount: 39000,
      recurring: true,
    })

    const rows = await listRecurrentesToCarry({
      db: s.db,
      householdId: s.householdId,
      monthStart: VIEWED,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.alreadyThere).toBe(true)
  })

  it('carries last month’s amount, and the copy is recurring too', async () => {
    const s = await setUp()
    const luz = await bill({
      ...s,
      name: 'Luz',
      amount: 36800,
      recurring: true,
      paid: true,
    })

    const [carried] = await carryRecurrentes({
      db: s.db,
      householdId: s.householdId,
      pendientes: [luz],
    })

    expect(carried).toEqual(
      expect.objectContaining({
        name: 'Luz',
        expectedAmount: 36800,
        recurring: true,
        status: 'pending',
      }),
    )
    // Due the same day, one month on -- so next month it can be carried
    // again without anyone having to remember a toggle.
    expect(carried?.dueDate.getMonth()).toBe(10)
  })
})

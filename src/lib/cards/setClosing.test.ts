import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listCategories } from '@/lib/expenses'
import { markResumenPaid } from './purchases'
import { createCard } from './cards'
import { createCardPurchase, listResumenCuotas } from './purchases'
import { resumenIdFor } from './cuotas'
import { setCardClosingDay, ClosingDayNotOnCreditError } from './setClosing'

// The month the household is in: 27 November 2026, the day all of this was
// reported from.
const TODAY = new Date(2026, 10, 27, 12)
const NOVEMBER = new Date(2026, 10, 1)
const DECEMBER = new Date(2026, 11, 1)
const JANUARY = new Date(2027, 0, 1)

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
  readonly categoryId: string
  readonly buy: (
    day: number,
    name: string,
    total: number,
    month?: number,
  ) => Promise<string>
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 500_000,
  })
  const householdId = household.id
  const categories = await listCategories({ db, householdId })
  const category = categories[0]
  if (category === undefined) throw new Error('expected a seeded category')
  const card = await createCard({
    db,
    householdId,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
  })
  const buy = async (day: number, name: string, total: number, month = 10) => {
    const purchase = await createCardPurchase({
      db,
      householdId,
      cardId: card.id,
      categoryId: category.id,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      name,
      total,
      cuotas: 1,
      purchaseDate: new Date(2026, month, day, 12),
      comments: '',
    })
    return purchase.id
  }
  return { db, householdId, cardId: card.id, categoryId: category.id, buy }
}

async function namesIn(
  db: HouseholdsDb,
  householdId: string,
  cardId: string,
  monthStart: Date,
): Promise<readonly string[]> {
  const id = resumenIdFor(cardId, monthStart)
  const resumen = await db.getPendiente({ householdId, pendienteId: id })
  if (resumen === null) return []
  const cuotas = await listResumenCuotas({ db, householdId, resumen })
  return cuotas.map(({ purchase }) => purchase.name).sort()
}

describe('setting what day the card closed', () => {
  it('moves what was bought on or after it into the next resumen', async () => {
    const { db, householdId, cardId, buy } = await setup()
    await buy(25, 'Antes', 1000)
    await buy(26, 'El día', 2000)
    await buy(27, 'Después', 3000)

    // Everything starts in December, which is what the app did before it
    // knew about cierres.
    expect(await namesIn(db, householdId, cardId, DECEMBER)).toEqual([
      'Antes',
      'Después',
      'El día',
    ])

    const result = await setCardClosingDay({
      db,
      householdId,
      cardId,
      day: 26,
      now: TODAY,
    })

    expect(result.moved.map((one) => one.name).sort()).toEqual([
      'Después',
      'El día',
    ])
    expect(result.locked).toEqual([])
    expect(await namesIn(db, householdId, cardId, DECEMBER)).toEqual(['Antes'])
    expect(await namesIn(db, householdId, cardId, JANUARY)).toEqual([
      'Después',
      'El día',
    ])
  })

  it('moves the money with them', async () => {
    const { db, householdId, cardId, buy } = await setup()
    await buy(25, 'Antes', 1000)
    await buy(27, 'Después', 3000)

    await setCardClosingDay({ db, householdId, cardId, day: 26, now: TODAY })

    const december = await db.getPendiente({
      householdId,
      pendienteId: resumenIdFor(cardId, DECEMBER),
    })
    const january = await db.getPendiente({
      householdId,
      pendienteId: resumenIdFor(cardId, JANUARY),
    })
    expect(december?.estimatedAmount).toBe(1000)
    expect(january?.estimatedAmount).toBe(3000)
  })

  it('places what is bought afterwards without being asked again', async () => {
    const { db, householdId, cardId, buy } = await setup()
    await setCardClosingDay({ db, householdId, cardId, day: 26, now: TODAY })

    await buy(27, 'Nuevo', 5000)

    expect(await namesIn(db, householdId, cardId, JANUARY)).toEqual(['Nuevo'])
    expect(await namesIn(db, householdId, cardId, DECEMBER)).toEqual([])
  })

  it('leaves alone a consumo whose resumen is already paid, and says which', async () => {
    const { db, householdId, cardId, buy } = await setup()
    // October, so its resumen is November's -- one that can already be
    // paid, which is what locks the purchase.
    await buy(27, 'Trabado', 3000, 9)
    await markResumenPaid({
      db,
      householdId,
      resumenId: resumenIdFor(cardId, NOVEMBER),
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      amountPaid: 3000,
      paymentDate: TODAY,
    })

    const result = await setCardClosingDay({
      db,
      householdId,
      cardId,
      day: 26,
      month: '2026-10',
      now: TODAY,
    })

    expect(result.moved).toEqual([])
    expect(result.locked.map((one) => one.name)).toEqual(['Trabado'])
  })

  it('refuses a day that some month does not have', async () => {
    const { db, householdId, cardId } = await setup()
    await expect(
      setCardClosingDay({ db, householdId, cardId, day: 31, now: TODAY }),
    ).rejects.toThrow(/del 1 al 28/)
  })

  it('refuses on anything that is not a credit card', async () => {
    const { db, householdId } = await setup()
    const debito = await createCard({
      db,
      householdId,
      name: 'Débito',
      kind: 'debito',
      currency: 'ARS',
    })
    await expect(
      setCardClosingDay({
        db,
        householdId,
        cardId: debito.id,
        day: 26,
        now: TODAY,
      }),
    ).rejects.toBeInstanceOf(ClosingDayNotOnCreditError)
  })
})

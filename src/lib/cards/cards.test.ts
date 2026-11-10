import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { listPendientesForMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { CardNameTakenError, createCard, listCards, renameCard } from './cards'
import { resumenIdFor } from './cuotas'
import {
  CardNotFoundError,
  createCardPurchase,
  markResumenPaid,
} from './purchases'

async function setup() {
  const memory = createMemoryHouseholdsDb()
  const db = memory.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 100,
  })
  return { memory, db, householdId: household.id }
}

describe('createCard', () => {
  it('stores the trimmed name', async () => {
    const { db, householdId } = await setup()

    const card = await createCard({ db, householdId, name: '  Visa  ' })

    expect(card.name).toBe('Visa')
    expect(await listCards({ db, householdId })).toEqual([card])
  })

  it('rejects a blank name and creates nothing', async () => {
    const { db, householdId } = await setup()

    await expect(createCard({ db, householdId, name: '   ' })).rejects.toThrow(
      'Ingresá un nombre para la tarjeta',
    )
    expect(await listCards({ db, householdId })).toEqual([])
  })

  it('rejects a name that differs only in case from an existing card', async () => {
    const { db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })

    await expect(
      createCard({ db, householdId, name: ' visa ' }),
    ).rejects.toBeInstanceOf(CardNameTakenError)
    expect(await listCards({ db, householdId })).toHaveLength(1)
  })

  it('allows the same name in another household', async () => {
    const { memory, db, householdId } = await setup()
    const other = memory.asUser('user-3')
    const otherHousehold = await createHouseholdWithMembership({
      db: other,
      userId: 'user-3',
      name: 'Otra',
      monthlyBudget: 100,
    })
    await createCard({ db, householdId, name: 'Visa' })

    const card = await createCard({
      db: other,
      householdId: otherHousehold.id,
      name: 'Visa',
    })

    expect(card.householdId).toBe(otherHousehold.id)
  })
})

describe('listCards', () => {
  it('returns cards sorted by name', async () => {
    const { db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })
    await createCard({ db, householdId, name: 'Amex' })

    const names = (await listCards({ db, householdId })).map((c) => c.name)

    expect(names).toEqual(['Amex', 'Visa'])
  })

  it('shows every member of the household the same cards', async () => {
    const { memory, db, householdId } = await setup()
    memory.addMember({ userId: 'user-2', householdId })
    await createCard({ db, householdId, name: 'Visa' })

    const seenBySecond = await listCards({
      db: memory.asUser('user-2'),
      householdId,
    })

    expect(seenBySecond.map((c) => c.name)).toEqual(['Visa'])
  })

  it('denies someone outside the household', async () => {
    const { memory, db, householdId } = await setup()
    await createCard({ db, householdId, name: 'Visa' })

    await expect(
      listCards({ db: memory.asUser('outsider'), householdId }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })

  it('denies someone outside the household from creating a card', async () => {
    const { memory, householdId } = await setup()

    await expect(
      createCard({ db: memory.asUser('outsider'), householdId, name: 'Visa' }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })
})

describe('renameCard', () => {
  async function setupWithCard() {
    const s = await setup()
    const visa = await createCard({ ...s, name: 'Visa' })
    return { ...s, visa }
  }

  it('stores the trimmed new name', async () => {
    const { db, householdId, visa } = await setupWithCard()
    const renamed = await renameCard({
      db,
      householdId,
      cardId: visa.id,
      name: '  Visa Gold ',
    })
    expect(renamed.name).toBe('Visa Gold')
    expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual([
      'Visa Gold',
    ])
  })

  it('rejects a blank name and changes nothing', async () => {
    const { db, householdId, visa } = await setupWithCard()
    await expect(
      renameCard({ db, householdId, cardId: visa.id, name: '  ' }),
    ).rejects.toThrow('Ingresá un nombre para la tarjeta')
    expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual([
      'Visa',
    ])
  })

  it("rejects another card's name in any case", async () => {
    const { db, householdId, visa } = await setupWithCard()
    await createCard({ db, householdId, name: 'Amex' })
    await expect(
      renameCard({ db, householdId, cardId: visa.id, name: ' AMEX ' }),
    ).rejects.toBeInstanceOf(CardNameTakenError)
    expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual([
      'Amex',
      'Visa',
    ])
  })

  it('allows a change in case of its own name', async () => {
    const { db, householdId, visa } = await setupWithCard()
    const renamed = await renameCard({
      db,
      householdId,
      cardId: visa.id,
      name: 'VISA',
    })
    expect(renamed.name).toBe('VISA')
  })

  it('denies someone outside the household', async () => {
    const { memory, householdId, visa } = await setupWithCard()
    await expect(
      renameCard({
        db: memory.asUser('outsider'),
        householdId,
        cardId: visa.id,
        name: 'Otra',
      }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })

  it('rejects a card from another household', async () => {
    const { memory, db, householdId } = await setupWithCard()
    const other = memory.asUser('user-3')
    const otherHousehold = await createHouseholdWithMembership({
      db: other,
      userId: 'user-3',
      name: 'Otra',
      monthlyBudget: 100,
    })
    const foreign = await createCard({
      db: other,
      householdId: otherHousehold.id,
      name: 'Amex',
    })
    await expect(
      renameCard({ db, householdId, cardId: foreign.id, name: 'Mía' }),
    ).rejects.toBeInstanceOf(CardNotFoundError)
    expect(
      (await listCards({ db: other, householdId: otherHousehold.id }))[0]?.name,
    ).toBe('Amex')
  })

  describe('with Resúmenes', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 20, 12))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('renames every Resumen of the card, paid ones too, but not the expenses a payment saved', async () => {
      const { db, householdId, visa } = await setupWithCard()
      const amex = await createCard({ db, householdId, name: 'Amex' })
      const categories = await listCategories({ db, householdId })
      const categoryId = categories[0]?.id ?? ''
      const buy = (cardId: string) =>
        createCardPurchase({
          db,
          householdId,
          cardId,
          categoryId,
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name: 'Zapatillas',
          total: 200,
          cuotas: 2,
          purchaseDate: new Date(2026, 8, 5),
          comments: '',
        })
      await buy(visa.id)
      await buy(amex.id)
      vi.setSystemTime(new Date(2026, 9, 15, 12))
      const { expenses } = await markResumenPaid({
        db,
        householdId,
        resumenId: resumenIdFor(visa.id, new Date(2026, 9, 1)),
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        // More than the 100 cuota, so the payment also saves an ajuste.
        amountPaid: 120,
        paymentDate: new Date(2026, 9, 15),
      })

      await renameCard({ db, householdId, cardId: visa.id, name: 'Visa Gold' })

      // Pending ones show in every month's list, so keyed by id.
      const byId = new Map<string, Pendiente>()
      for (const month of [9, 10]) {
        for (const p of await listPendientesForMonth({
          db,
          householdId,
          monthStart: new Date(2026, month, 1),
          monthEnd: new Date(2026, month + 1, 0, 23, 59, 59, 999),
        })) {
          byId.set(p.id, p)
        }
      }
      const resumenes = [...byId.values()]
      expect(
        resumenes.map((p) => [
          p.cardId,
          p.dueDate.getMonth(),
          p.status,
          p.name,
        ]),
      ).toEqual(
        expect.arrayContaining([
          [visa.id, 9, 'paid', 'Visa Gold'],
          [visa.id, 10, 'pending', 'Visa Gold'],
          [amex.id, 9, 'pending', 'Amex'],
          [amex.id, 10, 'pending', 'Amex'],
        ]),
      )
      expect(resumenes).toHaveLength(4)
      const saved = await listExpensesInMonth({
        db,
        householdId,
        monthStart: new Date(2026, 9, 1),
        monthEnd: new Date(2026, 9, 31, 23, 59, 59, 999),
      })
      expect(saved.map((e) => e.name).sort()).toEqual(
        expenses.map((e) => e.name).sort(),
      )
      expect(saved.map((e) => e.name)).toContain('Visa — ajuste')
    })
  })
})

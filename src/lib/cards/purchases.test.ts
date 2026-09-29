import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computePendingCommitted,
  computeRemainingBudget,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createCard } from './cards'
import { createCardPurchase, ResumenAlreadyPaidError } from './purchases'

const TODAY = new Date(2026, 8, 20, 12)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const memory = createMemoryHouseholdsDb()
  const db = memory.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 1000,
  })
  const householdId = household.id
  const categories = await listCategories({ db, householdId })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected a seeded Comida category')
  }
  const visa = await createCard({ db, householdId, name: 'Visa' })
  return { memory, db, householdId, comidaId: comida.id, visa }
}

type Setup = Awaited<ReturnType<typeof setup>>

function purchase(
  s: Setup,
  overrides: Partial<Parameters<typeof createCardPurchase>[0]> = {},
) {
  return createCardPurchase({
    db: s.db,
    householdId: s.householdId,
    cardId: s.visa.id,
    categoryId: s.comidaId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Zapatillas',
    total: 300,
    cuotas: 3,
    purchaseDate: new Date(2026, 8, 5),
    comments: '',
    ...overrides,
  })
}

function monthRange(year: number, month: number) {
  return {
    monthStart: new Date(year, month, 1),
    monthEnd: new Date(year, month + 1, 0, 23, 59, 59, 999),
  }
}

async function resumenesIn(s: Setup, year: number, month: number) {
  const { monthStart, monthEnd } = monthRange(year, month)
  const pendientes = await listPendientes({
    db: s.db,
    householdId: s.householdId,
  })
  return pendientesDueInMonth(pendientes, monthStart, monthEnd)
}

async function remainingIn(s: Setup, year: number, month: number) {
  const range = monthRange(year, month)
  const expenses = await listExpensesInMonth({
    db: s.db,
    householdId: s.householdId,
    ...range,
  })
  return computeRemainingBudget(
    1000,
    expenses,
    computePendingCommitted(await resumenesIn(s, year, month)),
  )
}

describe('createCardPurchase', () => {
  it('stores the purchase with its total and cuotas', async () => {
    const s = await setup()

    const created = await purchase(s, { name: '  Zapatillas  ' })

    expect(created).toEqual(
      expect.objectContaining({
        cardId: s.visa.id,
        categoryId: s.comidaId,
        name: 'Zapatillas',
        total: 300,
        cuotas: 3,
        purchaseDate: new Date(2026, 8, 5),
      }),
    )
  })

  it('adds one Resumen per cuota month, due day 10, named after the card, in "Tarjeta"', async () => {
    const s = await setup()

    const created = await purchase(s, { total: 100 })

    const categories = await listCategories({
      db: s.db,
      householdId: s.householdId,
    })
    const tarjeta = categories.find((category) => category.name === 'Tarjeta')
    expect(tarjeta).toBeDefined()
    const pendientes = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })
    expect(
      pendientes.map((p) => ({
        id: p.id,
        name: p.name,
        dueDate: p.dueDate,
        expectedAmount: p.expectedAmount,
        categoryId: p.categoryId,
        cardId: p.cardId,
        purchaseIds: p.purchaseIds,
      })),
    ).toEqual([
      {
        id: `${s.visa.id}_2026-10`,
        name: 'Visa',
        dueDate: new Date(2026, 9, 10),
        expectedAmount: 33.33,
        categoryId: tarjeta?.id,
        cardId: s.visa.id,
        purchaseIds: [created.id],
      },
      {
        id: `${s.visa.id}_2026-11`,
        name: 'Visa',
        dueDate: new Date(2026, 10, 10),
        expectedAmount: 33.33,
        categoryId: tarjeta?.id,
        cardId: s.visa.id,
        purchaseIds: [created.id],
      },
      {
        id: `${s.visa.id}_2026-12`,
        name: 'Visa',
        dueDate: new Date(2026, 11, 10),
        expectedAmount: 33.34,
        categoryId: tarjeta?.id,
        cardId: s.visa.id,
        purchaseIds: [created.id],
      },
    ])
  })

  it('sums every purchase of a card into its one Resumen for the month', async () => {
    const s = await setup()

    const first = await purchase(s, { total: 10.1, cuotas: 1 })
    const second = await purchase(s, {
      total: 20.2,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 18),
    })

    const october = await resumenesIn(s, 2026, 9)
    expect(october).toHaveLength(1)
    expect(october[0]?.expectedAmount).toBe(30.3)
    expect(october[0]?.purchaseIds).toEqual([first.id, second.id])
  })

  it('keeps each card in its own Resumen', async () => {
    const s = await setup()
    const master = await createCard({
      db: s.db,
      householdId: s.householdId,
      name: 'Master',
    })

    await purchase(s, { cuotas: 1, total: 10 })
    await purchase(s, { cuotas: 1, total: 20, cardId: master.id })

    const october = await resumenesIn(s, 2026, 9)
    expect(october.map((r) => [r.name, r.expectedAmount]).sort()).toEqual([
      ['Master', 20],
      ['Visa', 10],
    ])
  })

  it('leaves the purchase month budget alone and charges each cuota month', async () => {
    const s = await setup()

    await purchase(s, { total: 300, cuotas: 3 })

    expect(await remainingIn(s, 2026, 8)).toBe(1000)
    expect(await remainingIn(s, 2026, 9)).toBe(900)
    expect(await remainingIn(s, 2026, 11)).toBe(900)
  })

  it('creates no Resumen for a month with no cuotas', async () => {
    const s = await setup()

    await purchase(s, { cuotas: 2 })

    expect(await resumenesIn(s, 2026, 8)).toEqual([])
    expect(await resumenesIn(s, 2026, 11)).toEqual([])
  })

  it.each([0, 25, 1.5])('rejects %s cuotas', async (cuotas) => {
    const s = await setup()

    await expect(purchase(s, { cuotas })).rejects.toThrow(
      'Las cuotas deben ser un número entero entre 1 y 24',
    )
    expect(
      await listPendientes({ db: s.db, householdId: s.householdId }),
    ).toEqual([])
  })

  it('accepts 24 cuotas, the last landing two years on', async () => {
    const s = await setup()

    await purchase(s, { total: 2400, cuotas: 24 })

    expect(
      (await resumenesIn(s, 2028, 8)).map((r) => [r.dueDate, r.expectedAmount]),
    ).toEqual([[new Date(2028, 8, 10), 100]])
    expect(await resumenesIn(s, 2028, 9)).toEqual([])
  })

  it('rejects a total smaller than one cent per cuota', async () => {
    const s = await setup()

    await expect(purchase(s, { total: 0.02, cuotas: 3 })).rejects.toThrow(
      'El precio tiene que ser de al menos $0,01 por cuota',
    )
  })

  it('accepts exactly one cent per cuota', async () => {
    const s = await setup()

    await purchase(s, { total: 0.03, cuotas: 3 })

    expect(
      (await resumenesIn(s, 2026, 9)).map((r) => r.expectedAmount),
    ).toEqual([0.01])
  })

  it('rejects a future purchase date', async () => {
    const s = await setup()

    await expect(
      purchase(s, { purchaseDate: new Date(2026, 8, 21) }),
    ).rejects.toThrow('La fecha del gasto no puede ser futura')
  })

  it('rejects a blank name', async () => {
    const s = await setup()

    await expect(purchase(s, { name: '  ' })).rejects.toThrow(
      'El nombre del gasto no puede estar vacío',
    )
  })

  it('rejects, writing nothing, when a cuota would land in a paid Resumen', async () => {
    const s = await setup()
    const paidNovember: Pendiente = {
      id: `${s.visa.id}_2026-11`,
      householdId: s.householdId,
      categoryId: s.comidaId,
      name: 'Visa',
      dueDate: new Date(2026, 10, 10),
      expectedAmount: 50,
      recurring: false,
      autoDebit: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(2026, 10, 10),
      createdAt: new Date(2026, 8, 1),
      cardId: s.visa.id,
      purchaseIds: ['older'],
    }
    s.memory.seedPendiente(paidNovember)

    await expect(purchase(s, { cuotas: 3 })).rejects.toThrow(
      new ResumenAlreadyPaidError('Visa', new Date(2026, 10, 1)),
    )
    await expect(purchase(s, { cuotas: 3 })).rejects.toThrow(
      'El resumen de Visa de noviembre de 2026 ya está pagado.',
    )
    expect(
      await listPendientes({ db: s.db, householdId: s.householdId }),
    ).toEqual([])
  })

  it('rejects a card from another household', async () => {
    const s = await setup()
    const other = s.memory.asUser('user-2')
    const otherHousehold = await createHouseholdWithMembership({
      db: other,
      userId: 'user-2',
      name: 'Otra',
      monthlyBudget: 100,
    })
    const foreign = await createCard({
      db: other,
      householdId: otherHousehold.id,
      name: 'Amex',
    })

    await expect(purchase(s, { cardId: foreign.id })).rejects.toThrow(
      'No se encontró la tarjeta.',
    )
  })

  it('denies someone outside the household', async () => {
    const s = await setup()

    await expect(
      purchase(
        { ...s, db: s.memory.asUser('outsider') },
        {
          memberId: 'outsider',
        },
      ),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })
})

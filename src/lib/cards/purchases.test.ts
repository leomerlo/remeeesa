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
import {
  cardsDueNextMonthTotal,
  createCardPurchase,
  deleteCardPurchase,
  listCardPurchasesInMonth,
  listResumenCuotas,
  ResumenAlreadyPaidError,
  updateCardPurchase,
} from './purchases'

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

async function resumenSummary(s: Setup) {
  const pendientes = await listPendientes({
    db: s.db,
    householdId: s.householdId,
  })
  return pendientes.map((p) => [p.id, p.expectedAmount, p.purchaseIds])
}

function edit(
  s: Setup,
  purchaseId: string,
  overrides: Partial<Parameters<typeof updateCardPurchase>[0]> = {},
) {
  return updateCardPurchase({
    db: s.db,
    householdId: s.householdId,
    purchaseId,
    cardId: s.visa.id,
    categoryId: s.comidaId,
    name: 'Zapatillas',
    total: 300,
    cuotas: 3,
    purchaseDate: new Date(2026, 8, 5),
    comments: '',
    ...overrides,
  })
}

describe('updateCardPurchase', () => {
  it('rewrites every field and returns the edited purchase', async () => {
    const s = await setup()
    const created = await purchase(s)
    const categories = await listCategories({
      db: s.db,
      householdId: s.householdId,
    })
    const hogar = categories.find((category) => category.name !== 'Comida')
    if (hogar === undefined) {
      throw new Error('expected a second seeded category')
    }

    const edited = await edit(s, created.id, {
      name: '  Botines ',
      categoryId: hogar.id,
      total: 90,
      cuotas: 2,
      purchaseDate: new Date(2026, 8, 1),
      comments: 'regalo',
    })

    expect(edited).toEqual({
      ...created,
      name: 'Botines',
      categoryId: hogar.id,
      total: 90,
      cuotas: 2,
      purchaseDate: new Date(2026, 8, 1),
      comments: 'regalo',
    })
    expect(
      await listCardPurchasesInMonth({
        db: s.db,
        householdId: s.householdId,
        ...monthRange(2026, 8),
      }),
    ).toEqual([edited])
  })

  it('recomputes each Resumen the purchase is in and drops ones left empty', async () => {
    const s = await setup()
    const other = await purchase(s, { total: 10, cuotas: 1 })
    const created = await purchase(s, { total: 300, cuotas: 3 })

    await edit(s, created.id, { total: 100, cuotas: 1 })

    expect(await resumenSummary(s)).toEqual([
      [`${s.visa.id}_2026-10`, 110, [other.id, created.id]],
    ])
  })

  it('moves the cuotas to the new months when the date changes', async () => {
    const s = await setup()
    const created = await purchase(s, { total: 100, cuotas: 2 })

    await edit(s, created.id, {
      total: 100,
      cuotas: 2,
      purchaseDate: new Date(2026, 7, 20),
    })

    expect(await resumenSummary(s)).toEqual([
      [`${s.visa.id}_2026-09`, 50, [created.id]],
      [`${s.visa.id}_2026-10`, 50, [created.id]],
    ])
  })

  it('leaves the Resúmenes untouched when only the name changes', async () => {
    const s = await setup()
    const created = await purchase(s, { total: 100, cuotas: 3 })
    const before = await resumenSummary(s)

    await edit(s, created.id, { name: 'Botines', total: 100, cuotas: 3 })

    expect(await resumenSummary(s)).toEqual(before)
    expect(before).toEqual([
      [`${s.visa.id}_2026-10`, 33.33, [created.id]],
      [`${s.visa.id}_2026-11`, 33.33, [created.id]],
      [`${s.visa.id}_2026-12`, 33.34, [created.id]],
    ])
  })

  it('keeps shared Resúmenes exact to the cent when the cuotas shift a month', async () => {
    const s = await setup()
    const other = await purchase(s, { total: 0.1, cuotas: 1 })
    const created = await purchase(s, { total: 100, cuotas: 3 })

    await edit(s, created.id, {
      total: 100,
      cuotas: 3,
      purchaseDate: new Date(2026, 7, 5),
    })

    expect(await resumenSummary(s)).toEqual([
      [`${s.visa.id}_2026-09`, 33.33, [created.id]],
      [`${s.visa.id}_2026-10`, 33.43, [other.id, created.id]],
      [`${s.visa.id}_2026-11`, 33.34, [created.id]],
    ])
  })

  it('rejects an edit into a month whose Resumen is already paid, writing nothing', async () => {
    const s = await setup()
    await purchase(s, {
      total: 10,
      cuotas: 1,
      purchaseDate: new Date(2026, 7, 5),
    })
    const created = await purchase(s, { total: 100, cuotas: 1 })
    const september = (
      await listPendientes({
        db: s.db,
        householdId: s.householdId,
      })
    ).find((p) => p.id === `${s.visa.id}_2026-09`)
    if (september === undefined) {
      throw new Error('expected the September Resumen')
    }
    s.memory.seedPendiente({ ...september, status: 'paid' })
    const before = await resumenSummary(s)

    await expect(
      edit(s, created.id, {
        total: 100,
        cuotas: 1,
        purchaseDate: new Date(2026, 7, 10),
      }),
    ).rejects.toBeInstanceOf(ResumenAlreadyPaidError)
    expect(await resumenSummary(s)).toEqual(before)
  })

  it("moves the cuotas to the other card's Resúmenes", async () => {
    const s = await setup()
    const master = await createCard({
      db: s.db,
      householdId: s.householdId,
      name: 'Master',
    })
    const created = await purchase(s, { total: 20, cuotas: 1 })

    await edit(s, created.id, { cardId: master.id, total: 20, cuotas: 1 })

    const pendientes = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })
    expect(
      pendientes.map((p) => [p.id, p.name, p.expectedAmount, p.purchaseIds]),
    ).toEqual([[`${master.id}_2026-10`, 'Master', 20, [created.id]]])
  })

  it('writes nothing when a Resumen it touches is already paid', async () => {
    const s = await setup()
    const created = await purchase(s, { total: 100, cuotas: 1 })
    const [october] = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })
    if (october === undefined) {
      throw new Error('expected the October Resumen')
    }
    s.memory.seedPendiente({ ...october, status: 'paid' })

    await expect(edit(s, created.id, { total: 50, cuotas: 1 })).rejects.toThrow(
      'El resumen de Visa de octubre de 2026 ya está pagado.',
    )
    expect(
      await listCardPurchasesInMonth({
        db: s.db,
        householdId: s.householdId,
        ...monthRange(2026, 8),
      }),
    ).toEqual([created])
  })

  it('validates like a new purchase', async () => {
    const s = await setup()
    const created = await purchase(s)

    await expect(edit(s, created.id, { cuotas: 25 })).rejects.toThrow(
      'Las cuotas deben ser un número entero entre 1 y 24',
    )
    await expect(
      edit(s, created.id, { purchaseDate: new Date(2026, 8, 21) }),
    ).rejects.toThrow()
  })

  it('rejects a purchase that does not exist or belongs to another household', async () => {
    const s = await setup()

    await expect(edit(s, 'missing')).rejects.toThrow(
      'No se encontró la compra.',
    )
  })

  it('denies someone outside the household', async () => {
    const s = await setup()
    const created = await purchase(s)

    await expect(
      edit({ ...s, db: s.memory.asUser('outsider') }, created.id),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })
})

describe('deleteCardPurchase', () => {
  it('removes the purchase and its cuotas, dropping Resúmenes left empty', async () => {
    const s = await setup()
    const other = await purchase(s, { total: 10, cuotas: 1 })
    const created = await purchase(s, { total: 300, cuotas: 3 })

    await deleteCardPurchase({
      db: s.db,
      householdId: s.householdId,
      purchaseId: created.id,
    })

    expect(await resumenSummary(s)).toEqual([
      [`${s.visa.id}_2026-10`, 10, [other.id]],
    ])
    expect(
      await listCardPurchasesInMonth({
        db: s.db,
        householdId: s.householdId,
        ...monthRange(2026, 8),
      }),
    ).toEqual([other])
  })

  it("keeps the other purchase's amount exact in a shared Resumen", async () => {
    const s = await setup()
    const other = await purchase(s, { total: 0.1, cuotas: 1 })
    const created = await purchase(s, { total: 0.2, cuotas: 1 })

    await deleteCardPurchase({
      db: s.db,
      householdId: s.householdId,
      purchaseId: created.id,
    })

    expect(await resumenSummary(s)).toEqual([
      [`${s.visa.id}_2026-10`, 0.1, [other.id]],
    ])
  })

  it('writes nothing when one of its Resúmenes is already paid', async () => {
    const s = await setup()
    const created = await purchase(s, { total: 100, cuotas: 1 })
    const [october] = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })
    if (october === undefined) {
      throw new Error('expected the October Resumen')
    }
    s.memory.seedPendiente({ ...october, status: 'paid' })

    await expect(
      deleteCardPurchase({
        db: s.db,
        householdId: s.householdId,
        purchaseId: created.id,
      }),
    ).rejects.toBeInstanceOf(ResumenAlreadyPaidError)
    expect(
      await listCardPurchasesInMonth({
        db: s.db,
        householdId: s.householdId,
        ...monthRange(2026, 8),
      }),
    ).toEqual([created])
  })

  it('rejects a purchase that does not exist', async () => {
    const s = await setup()

    await expect(
      deleteCardPurchase({
        db: s.db,
        householdId: s.householdId,
        purchaseId: 'missing',
      }),
    ).rejects.toThrow('No se encontró la compra.')
  })
})

describe('listCardPurchasesInMonth', () => {
  it('lists the purchases dated in the month, newest first', async () => {
    const s = await setup()
    const early = await purchase(s, {
      name: 'Early',
      purchaseDate: new Date(2026, 8, 2),
    })
    const late = await purchase(s, {
      name: 'Late',
      purchaseDate: new Date(2026, 8, 18),
    })
    await purchase(s, { name: 'August', purchaseDate: new Date(2026, 7, 31) })

    const listed = await listCardPurchasesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })

    expect(listed.map((p) => p.id)).toEqual([late.id, early.id])
  })

  it('denies someone outside the household', async () => {
    const s = await setup()

    await expect(
      listCardPurchasesInMonth({
        db: s.memory.asUser('outsider'),
        householdId: s.householdId,
        ...monthRange(2026, 8),
      }),
    ).rejects.toBeInstanceOf(HouseholdAccessDeniedError)
  })
})

describe('listResumenCuotas', () => {
  it("lists each purchase's cuota that lands in the Resumen's month", async () => {
    const s = await setup()
    const zapatillas = await purchase(s, {
      name: 'Zapatillas',
      total: 100,
      cuotas: 3,
      purchaseDate: new Date(2026, 7, 5),
    })
    const cena = await purchase(s, {
      name: 'Cena',
      total: 40,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 12),
    })
    const [october] = await resumenesIn(s, 2026, 9)
    if (october === undefined) {
      throw new Error('expected an October Resumen')
    }

    const rows = await listResumenCuotas({
      db: s.db,
      householdId: s.householdId,
      resumen: october,
    })

    expect(
      rows.map((row) => [row.purchase.id, row.cuota.number, row.cuota.amount]),
    ).toEqual([
      [zapatillas.id, 2, 33.33],
      [cena.id, 1, 40],
    ])
  })

  it("picks the cuota of the Resumen's year, not just its month, across 24 cuotas", async () => {
    const s = await setup()
    // Cuota 1 lands October 2026 and cuota 13 October 2027.
    const tele = await purchase(s, {
      name: 'Tele',
      total: 240,
      cuotas: 24,
      purchaseDate: new Date(2026, 8, 5),
    })
    const [october2027] = await resumenesIn(s, 2027, 9)
    if (october2027 === undefined) {
      throw new Error('expected an October 2027 Resumen')
    }

    const rows = await listResumenCuotas({
      db: s.db,
      householdId: s.householdId,
      resumen: october2027,
    })

    expect(rows.map((row) => [row.purchase.id, row.cuota.number])).toEqual([
      [tele.id, 13],
    ])
  })

  it('skips ids with no purchase behind them, from another household, or with no cuota that month', async () => {
    const s = await setup()
    const zapatillas = await purchase(s, {
      name: 'Zapatillas',
      total: 100,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5),
    })
    // Its only cuota lands in August, not October.
    const earlier = await purchase(s, {
      name: 'Earlier',
      total: 10,
      cuotas: 1,
      purchaseDate: new Date(2026, 6, 5),
    })
    const otherDb = s.memory.asUser('user-2')
    const other = await createHouseholdWithMembership({
      db: otherDb,
      userId: 'user-2',
      name: 'Otra',
      monthlyBudget: 1000,
    })
    const [otherCategory] = await listCategories({
      db: otherDb,
      householdId: other.id,
    })
    if (otherCategory === undefined) {
      throw new Error('expected a seeded category')
    }
    const otherCard = await createCard({
      db: otherDb,
      householdId: other.id,
      name: 'Visa',
    })
    const foreign = await createCardPurchase({
      db: otherDb,
      householdId: other.id,
      cardId: otherCard.id,
      categoryId: otherCategory.id,
      memberId: 'user-2',
      authorDisplayName: 'Bea',
      name: 'Ajena',
      total: 50,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
    })
    const [october] = await resumenesIn(s, 2026, 9)
    if (october === undefined) {
      throw new Error('expected an October Resumen')
    }

    const rows = await listResumenCuotas({
      db: s.db,
      householdId: s.householdId,
      resumen: {
        ...october,
        purchaseIds: ['gone', foreign.id, earlier.id, zapatillas.id],
      },
    })

    expect(rows.map((row) => row.purchase.id)).toEqual([zapatillas.id])
  })
})

describe('cardsDueNextMonthTotal', () => {
  function resumen(overrides: Partial<Pendiente>): Pendiente {
    return {
      id: 'r',
      householdId: 'h',
      categoryId: 'c',
      name: 'Visa',
      dueDate: new Date(2026, 9, 10),
      expectedAmount: 100,
      recurring: false,
      autoDebit: false,
      status: 'pending',
      paidExpenseId: null,
      paidAt: null,
      createdAt: new Date(2026, 8, 1),
      cardId: 'card-1',
      purchaseIds: ['p'],
      ...overrides,
    }
  }

  it("sums the unpaid Resúmenes due in the calendar month after today's", () => {
    const total = cardsDueNextMonthTotal(
      [
        resumen({ expectedAmount: 10.1 }),
        resumen({ expectedAmount: 20.2, cardId: 'card-2' }),
        // Not next month.
        resumen({ dueDate: new Date(2026, 8, 10) }),
        resumen({ dueDate: new Date(2026, 10, 10) }),
        // Paid.
        resumen({ status: 'paid' }),
        // Not a Resumen.
        resumen({ cardId: undefined, purchaseIds: undefined }),
      ],
      new Date(2026, 8, 30),
    )

    expect(total).toBe(30.3)
  })

  it('rolls December into January of the next year', () => {
    expect(
      cardsDueNextMonthTotal(
        [resumen({ dueDate: new Date(2027, 0, 10), expectedAmount: 5 })],
        new Date(2026, 11, 31),
      ),
    ).toBe(5)
  })
})

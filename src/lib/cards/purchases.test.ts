import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computePendingCommitted,
  computeRemainingBudget,
  listCategories,
  listExpensesInMonth,
  updateExpense,
} from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import {
  createPendiente,
  listPendientes,
  listPendientesForMonth,
  PendienteNotFoundError,
  pendientesDueInMonth,
  unmarkPendientePaid,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createCard } from './cards'
import {
  canPayResumen,
  CardPurchaseLockedError,
  cardsDueNextMonthTotal,
  createCardPurchase,
  deleteCardPurchase,
  listCardPurchasesInMonth,
  listResumenCuotas,
  markResumenPaid,
  ResumenAlreadyPaidError,
  ResumenNotYetPayableError,
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

describe('markResumenPaid', () => {
  // Paid Resúmenes drop out of listPendientes, so look them up by month.
  async function resumenOf(s: Setup, year: number, month: number) {
    const all = await listPendientesForMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(year, month),
    })
    const found = all.find(
      (p) =>
        p.cardId === s.visa.id &&
        p.dueDate.getFullYear() === year &&
        p.dueDate.getMonth() === month,
    )
    if (found === undefined) {
      throw new Error('expected a Resumen')
    }
    return found
  }

  function pay(
    s: Setup,
    resumenId: string,
    amountPaid: number,
    paymentDate: Date,
  ) {
    return markResumenPaid({
      db: s.db,
      householdId: s.householdId,
      resumenId,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      amountPaid,
      paymentDate,
    })
  }

  async function expensesIn(s: Setup, year: number, month: number) {
    return listExpensesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(year, month),
    })
  }

  async function setupWithPurchases() {
    const s = await setup()
    const categories = await listCategories({
      db: s.db,
      householdId: s.householdId,
    })
    const salud = categories.find((category) => category.name === 'Salud')
    if (salud === undefined) {
      throw new Error('expected a seeded Salud category')
    }
    const zapatillas = await purchase(s, { total: 300, cuotas: 3 })
    const remedios = await purchase(s, {
      name: 'Remedios',
      categoryId: salud.id,
      total: 50,
      cuotas: 1,
    })
    return { ...s, zapatillas, remedios }
  }

  it("can't be paid before its month starts", async () => {
    const s = await setupWithPurchases()
    const october = await resumenOf(s, 2026, 9)

    expect(canPayResumen(october, new Date(2026, 8, 30, 23))).toBe(false)
    expect(canPayResumen(october, new Date(2026, 9, 1))).toBe(true)
    await expect(pay(s, october.id, 150, TODAY)).rejects.toThrow(
      new ResumenNotYetPayableError('Visa', new Date(2026, 9, 1)),
    )
    expect((await resumenOf(s, 2026, 9)).status).toBe('pending')
  })

  it('writes one expense per cuota in "Tarjeta", subcategorised by the purchase\'s category', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)

    const { pendiente, expenses } = await pay(
      s,
      october.id,
      150,
      new Date(2026, 9, 15),
    )

    const categories = await listCategories({
      db: s.db,
      householdId: s.householdId,
    })
    const tarjeta = categories.find((category) => category.name === 'Tarjeta')
    expect(
      expenses.map((e) => [e.name, e.price, e.subcategory, e.categoryId]),
    ).toEqual([
      ['Zapatillas', 100, 'Comida', tarjeta?.id],
      ['Remedios', 50, 'Salud', tarjeta?.id],
    ])
    expect(expenses.every((e) => e.pendienteId === october.id)).toBe(true)
    expect(expenses.every((e) => !e.isService)).toBe(true)
    expect(expenses.map((e) => e.expenseDate.toDateString())).toEqual([
      new Date(2026, 9, 15).toDateString(),
      new Date(2026, 9, 15).toDateString(),
    ])
    expect(pendiente.status).toBe('paid')
    expect(pendiente.paidExpenseIds).toEqual(expenses.map((e) => e.id))
    expect(await expensesIn(s, 2026, 9)).toHaveLength(2)
  })

  it("dates the expenses on the month's last day when paid after it (October paid 12 Nov → 31 Oct)", async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 10, 12, 12))
    const october = await resumenOf(s, 2026, 9)

    const { expenses } = await pay(s, october.id, 150, new Date(2026, 10, 12))

    expect(expenses.map((e) => e.expenseDate.toDateString())).toEqual([
      new Date(2026, 9, 31).toDateString(),
      new Date(2026, 9, 31).toDateString(),
    ])
    expect(await expensesIn(s, 2026, 10)).toEqual([])
  })

  it('records the difference as a "<card> — ajuste" with no subcategory, negative when less was paid', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 10, 12, 12))
    const october = await resumenOf(s, 2026, 9)
    const november = await resumenOf(s, 2026, 10)

    const over = await pay(s, october.id, 160.5, new Date(2026, 10, 12))
    const under = await pay(s, november.id, 90, new Date(2026, 10, 12))

    expect(over.expenses.at(-1)).toEqual(
      expect.objectContaining({
        name: 'Visa — ajuste',
        price: 10.5,
        subcategory: null,
        expenseDate: new Date(2026, 9, 31),
      }),
    )
    expect(under.expenses.map((e) => [e.name, e.price])).toEqual([
      ['Zapatillas', 100],
      ['Visa — ajuste', -10],
    ])
  })

  it('writes no ajuste when the total is paid exactly', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)

    const { expenses } = await pay(s, october.id, 150, new Date(2026, 9, 15))

    expect(expenses.map((e) => e.name)).not.toContain('Visa — ajuste')
  })

  it("keeps a cuota expense's subcategory when the expense is edited", async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)
    const { expenses } = await pay(s, october.id, 150, new Date(2026, 9, 15))
    const [first] = expenses
    if (first === undefined) {
      throw new Error('expected a cuota expense')
    }

    const edited = await updateExpense({
      db: s.db,
      householdId: s.householdId,
      expenseId: first.id,
      name: 'Botines',
    })

    expect(edited.subcategory).toBe('Comida')
    expect(
      (await expensesIn(s, 2026, 9)).find((e) => e.id === first.id)
        ?.subcategory,
    ).toBe('Comida')
  })

  it('requires a positive amount', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)

    for (const amount of [0, -5]) {
      await expect(
        pay(s, october.id, amount, new Date(2026, 9, 15)),
      ).rejects.toThrow('El precio del gasto debe ser un número positivo')
    }
    expect((await resumenOf(s, 2026, 9)).status).toBe('pending')
  })

  it('rejects paying an already-paid Resumen, writing nothing more', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)
    await pay(s, october.id, 150, new Date(2026, 9, 15))

    await expect(
      pay(s, october.id, 150, new Date(2026, 9, 15)),
    ).rejects.toThrow('El resumen de Visa de octubre de 2026 ya está pagado.')
    expect(await expensesIn(s, 2026, 9)).toHaveLength(2)
  })

  it('counts each cuota exactly once in every month the purchase touches, before and after paying', async () => {
    const s = await setup()
    await purchase(s, { total: 300, cuotas: 3 })
    const remainingByMonth = async () =>
      Promise.all([8, 9, 10, 11].map((month) => remainingIn(s, 2026, month)))
    expect(await remainingByMonth()).toEqual([1000, 900, 900, 900])

    vi.setSystemTime(new Date(2026, 10, 12, 12))
    await pay(s, (await resumenOf(s, 2026, 9)).id, 100, new Date(2026, 10, 12))
    expect(await remainingByMonth()).toEqual([1000, 900, 900, 900])

    await pay(s, (await resumenOf(s, 2026, 10)).id, 100, new Date(2026, 10, 12))
    expect(await remainingByMonth()).toEqual([1000, 900, 900, 900])
  })

  it('locks a purchase with a paid cuota against editing and deleting', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)
    await pay(s, october.id, 150, new Date(2026, 9, 15))

    const purchases = await listCardPurchasesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    expect(purchases.map((p) => p.paidResumenIds)).toEqual([
      [october.id],
      [october.id],
    ])
    await expect(
      edit(s, s.zapatillas.id, { name: 'Botines', total: 300, cuotas: 3 }),
    ).rejects.toBeInstanceOf(CardPurchaseLockedError)
    await expect(
      deleteCardPurchase({
        db: s.db,
        householdId: s.householdId,
        purchaseId: s.zapatillas.id,
      }),
    ).rejects.toThrow(
      'Tiene cuotas en un resumen ya pagado: no se puede editar ni borrar.',
    )
  })

  it('rejects logging or editing a purchase into a paid Resumen', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const other = await purchase(s, {
      name: 'Libro',
      total: 20,
      cuotas: 1,
      purchaseDate: new Date(2026, 9, 1),
    })
    await pay(s, (await resumenOf(s, 2026, 9)).id, 150, new Date(2026, 9, 15))

    await expect(
      purchase(s, { total: 10, cuotas: 1, purchaseDate: new Date(2026, 8, 2) }),
    ).rejects.toThrow('El resumen de Visa de octubre de 2026 ya está pagado.')
    await expect(
      edit(s, other.id, {
        total: 20,
        cuotas: 1,
        purchaseDate: new Date(2026, 8, 2),
      }),
    ).rejects.toThrow('El resumen de Visa de octubre de 2026 ya está pagado.')
  })

  it('undoing deletes its cuota expenses and ajuste, returns it to pending and unlocks its purchases', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)
    await pay(s, october.id, 200, new Date(2026, 9, 15))
    expect(await expensesIn(s, 2026, 9)).toHaveLength(3)

    const undone = await unmarkPendientePaid({
      db: s.db,
      householdId: s.householdId,
      pendienteId: october.id,
    })

    expect(undone.status).toBe('pending')
    expect(await expensesIn(s, 2026, 9)).toEqual([])
    expect(await remainingIn(s, 2026, 9)).toBe(850)
    await expect(
      edit(s, s.remedios.id, { name: 'Vitaminas', total: 50, cuotas: 1 }),
    ).resolves.toEqual(expect.objectContaining({ paidResumenIds: [] }))
  })

  it('keeps a purchase locked while another of its Resúmenes is still paid', async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 10, 12, 12))
    const october = await resumenOf(s, 2026, 9)
    const november = await resumenOf(s, 2026, 10)
    await pay(s, october.id, 150, new Date(2026, 10, 12))
    await pay(s, november.id, 100, new Date(2026, 10, 12))

    await unmarkPendientePaid({
      db: s.db,
      householdId: s.householdId,
      pendienteId: october.id,
    })

    await expect(
      edit(s, s.zapatillas.id, { name: 'Botines', total: 300, cuotas: 3 }),
    ).rejects.toBeInstanceOf(CardPurchaseLockedError)
    await expect(
      edit(s, s.remedios.id, { name: 'Vitaminas', total: 50, cuotas: 1 }),
    ).resolves.toBeDefined()
  })
  it("dates the expenses on the payment day when paid on the month's last day, and on that last day from the 1st of the next", async () => {
    const s = await setupWithPurchases()
    vi.setSystemTime(new Date(2026, 10, 1, 12))
    const october = await resumenOf(s, 2026, 9)
    const november = await resumenOf(s, 2026, 10)

    const lastDay = await pay(s, october.id, 150, new Date(2026, 9, 31, 23, 30))
    // November's Resumen paid on 1 Nov counts in November itself.
    const firstOfNext = await pay(s, november.id, 100, new Date(2026, 10, 1))

    expect(lastDay.expenses[0]?.expenseDate).toEqual(
      new Date(2026, 9, 31, 23, 30),
    )
    expect(firstOfNext.expenses[0]?.expenseDate).toEqual(new Date(2026, 10, 1))
    expect(await expensesIn(s, 2026, 9)).toHaveLength(2)
    expect(await expensesIn(s, 2026, 10)).toHaveLength(1)
  })

  it("pays one Resumen's cuota at a time, the last absorbing the cents, dating December's paid in January on 31 Dec", async () => {
    const s = await setup()
    // 100 / 3 → 33.33, 33.33, 33.34 in October, November and December.
    await purchase(s, { total: 100, cuotas: 3 })
    vi.setSystemTime(new Date(2027, 0, 4, 12))
    const december = await resumenOf(s, 2026, 11)

    const { expenses } = await pay(s, december.id, 33.34, new Date(2027, 0, 4))

    expect(expenses.map((e) => [e.name, e.price, e.expenseDate])).toEqual([
      ['Zapatillas', 33.34, new Date(2026, 11, 31)],
    ])
    expect(await expensesIn(s, 2026, 11)).toHaveLength(1)
    expect(await expensesIn(s, 2027, 0)).toEqual([])
    expect((await resumenOf(s, 2026, 9)).status).toBe('pending')
    expect((await resumenOf(s, 2026, 10)).status).toBe('pending')
  })

  it('writes no ajuste when cuotas only differ from the amount paid by float noise (0.1 + 0.2 paid as 0.3)', async () => {
    const s = await setup()
    await purchase(s, { name: 'Chicle', total: 0.1, cuotas: 1 })
    await purchase(s, { name: 'Caramelo', total: 0.2, cuotas: 1 })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const october = await resumenOf(s, 2026, 9)

    const exact = await pay(s, october.id, 0.3, new Date(2026, 9, 15))

    expect(exact.expenses.map((e) => e.name)).toEqual(['Chicle', 'Caramelo'])
  })

  it('rejects paying a Pendiente that is not a Resumen, leaving it pending', async () => {
    const s = await setup()
    const alquiler = await createPendiente({
      db: s.db,
      householdId: s.householdId,
      categoryId: s.comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 25),
      expectedAmount: 500,
    })

    await expect(pay(s, alquiler.id, 500, TODAY)).rejects.toBeInstanceOf(
      PendienteNotFoundError,
    )
    expect(await expensesIn(s, 2026, 8)).toEqual([])
    expect(
      (await listPendientes({ db: s.db, householdId: s.householdId })).find(
        (p) => p.id === alquiler.id,
      )?.status,
    ).toBe('pending')
  })
})

// A real Argentine credit card is billed in pesos and, separately, in
// dollars. The two totals cannot be added together, so the card keeps one
// Resumen per currency per month and each is settled on its own.
describe('a card that holds both currencies', () => {
  async function bothSetup() {
    const s = await setup()
    const amex = await createCard({
      db: s.db,
      householdId: s.householdId,
      name: 'Amex',
      currency: 'BOTH',
    })
    return { ...s, amex }
  }

  it('keeps the peso and the dollar consumos in separate Resúmenes', async () => {
    const s = await bothSetup()

    await purchase(s, {
      cardId: s.amex.id,
      name: 'Supermercado',
      total: 300,
      cuotas: 1,
    })
    await purchase(s, {
      cardId: s.amex.id,
      name: 'Hosting',
      total: 50,
      cuotas: 1,
      currency: 'USD',
    })

    const october = await resumenesIn(s, 2026, 9)
    expect(
      october
        .map((resumen) => ({
          name: resumen.name,
          currency: resumen.currency,
          amount: resumen.expectedAmount,
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    ).toEqual([
      { name: 'Amex', currency: 'ARS', amount: 300 },
      { name: 'Amex US$', currency: 'USD', amount: 50 },
    ])
  })

  it('leaves the dollar Resumen out of the peso budget', async () => {
    const s = await bothSetup()

    await purchase(s, {
      cardId: s.amex.id,
      total: 50,
      cuotas: 1,
      currency: 'USD',
    })

    // The whole 1000 is still there: a dollar bill commits no pesos.
    expect(await remainingIn(s, 2026, 9)).toBe(1000)
  })

  it('leaves the dollar Resumen out of "Tarjetas el mes que viene"', async () => {
    const s = await bothSetup()

    await purchase(s, {
      cardId: s.amex.id,
      name: 'Supermercado',
      total: 300,
      cuotas: 1,
    })
    await purchase(s, {
      cardId: s.amex.id,
      name: 'Hosting',
      total: 50,
      cuotas: 1,
      currency: 'USD',
    })
    const pendientes = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })

    expect(cardsDueNextMonthTotal(pendientes, TODAY)).toBe(300)
  })

  it('records the expenses of a paid dollar Resumen in dollars', async () => {
    const s = await bothSetup()
    // Bought in August, so the one cuota lands in September's Resumen,
    // which today (the 20th) is already payable.
    await purchase(s, {
      cardId: s.amex.id,
      name: 'Hosting',
      total: 50,
      cuotas: 1,
      purchaseDate: new Date(2026, 7, 5),
      currency: 'USD',
    })
    const [resumen] = await resumenesIn(s, 2026, 8)

    await markResumenPaid({
      db: s.db,
      householdId: s.householdId,
      resumenId: resumen?.id ?? '',
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      amountPaid: 50,
      paymentDate: new Date(2026, 8, 10),
    })

    const expenses = await listExpensesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    expect(expenses.map((expense) => expense.currency)).toEqual(['USD'])
    // Recorded, and still not counted.
    expect(await remainingIn(s, 2026, 8)).toBe(1000)
  })

  it('moves the cuotas between Resúmenes when an edit changes the currency', async () => {
    const s = await bothSetup()
    const created = await purchase(s, {
      cardId: s.amex.id,
      name: 'Hosting',
      total: 300,
      cuotas: 1,
    })

    await updateCardPurchase({
      db: s.db,
      householdId: s.householdId,
      purchaseId: created.id,
      cardId: s.amex.id,
      categoryId: s.comidaId,
      name: 'Hosting',
      total: 300,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
      currency: 'USD',
    })

    const october = await resumenesIn(s, 2026, 9)
    expect(
      october.map((resumen) => [resumen.name, resumen.expectedAmount]),
    ).toEqual([['Amex US$', 300]])
  })

  it('refuses a currency the card does not hold', async () => {
    const s = await setup()

    // s.visa was created without a currency, so it is a peso card.
    await expect(purchase(s, { currency: 'USD' })).rejects.toThrow(
      'Visa no admite consumos en esa moneda.',
    )
  })
})

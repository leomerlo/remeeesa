import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import {
  createPendiente,
  listPendientes,
  listPendientesForMonth,
} from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createCard } from './cards'
import {
  ConsumoFromServicioError,
  convertCardPurchaseToExpense,
} from './convertConsumo'
import {
  CardPurchaseLockedError,
  CardPurchaseNotFoundError,
  createCardPurchase,
  listCardPurchasesInMonth,
  markPendientePaidWithCard,
  markResumenPaid,
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
  return { db, householdId, comidaId: comida.id, visa }
}

type Setup = Awaited<ReturnType<typeof setup>>

function monthRange(year: number, month: number) {
  return {
    monthStart: new Date(year, month, 1),
    monthEnd: new Date(year, month + 1, 0, 23, 59, 59, 999),
  }
}

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
    comments: 'tres cuotas',
    ...overrides,
  })
}

function takeOffTheCard(
  s: Setup,
  purchaseId: string,
  overrides: Partial<Parameters<typeof convertCardPurchaseToExpense>[0]> = {},
) {
  return convertCardPurchaseToExpense({
    db: s.db,
    householdId: s.householdId,
    purchaseId,
    categoryId: s.comidaId,
    name: 'Zapatillas',
    price: 300,
    comments: 'tres cuotas',
    expenseDate: new Date(2026, 8, 5),
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    currency: 'ARS',
    paymentMethodId: null,
    ...overrides,
  })
}

describe('convertCardPurchaseToExpense', () => {
  it('writes the money as a gasto of the month it was made in', async () => {
    const s = await setup()
    const consumo = await purchase(s)

    const gasto = await takeOffTheCard(s, consumo.id)

    expect(gasto.price).toBe(300)
    expect(gasto.categoryId).toBe(s.comidaId)
    expect(gasto.paymentMethodId).toBeNull()
    const expenses = await listExpensesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    expect(expenses.map((one) => one.name)).toEqual(['Zapatillas'])
  })

  it('takes the consumo and its cuotas out of the Resúmenes', async () => {
    const s = await setup()
    const consumo = await purchase(s)
    const before = await listPendientes({
      db: s.db,
      householdId: s.householdId,
    })
    expect(before.filter((one) => one.cardId !== undefined)).toHaveLength(3)

    await takeOffTheCard(s, consumo.id)

    const after = await listPendientes({ db: s.db, householdId: s.householdId })
    expect(after.filter((one) => one.cardId !== undefined)).toHaveLength(0)
    const purchases = await listCardPurchasesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    expect(purchases).toHaveLength(0)
  })

  it('keeps the corrections made in the same save', async () => {
    const s = await setup()
    const consumo = await purchase(s)

    const gasto = await takeOffTheCard(s, consumo.id, {
      name: 'Zapatillas de Nico',
      price: 320.5,
      expenseDate: new Date(2026, 8, 7),
      comments: 'eran más caras',
    })

    expect(gasto.name).toBe('Zapatillas de Nico')
    expect(gasto.price).toBe(320.5)
    expect(gasto.comments).toBe('eran más caras')
    expect(gasto.expenseDate).toEqual(new Date(2026, 8, 7))
  })

  it('records what really paid for it', async () => {
    const s = await setup()
    const debito = await createCard({
      db: s.db,
      householdId: s.householdId,
      name: 'Débito Galicia',
      kind: 'debito',
    })
    const consumo = await purchase(s)

    const gasto = await takeOffTheCard(s, consumo.id, {
      paymentMethodId: debito.id,
    })

    expect(gasto.paymentMethodId).toBe(debito.id)
  })

  it('is authored by whoever makes the correction', async () => {
    const s = await setup()
    const consumo = await purchase(s)

    const gasto = await takeOffTheCard(s, consumo.id)

    // Not the consumo's author: the rules only let a member write an
    // Expense in their own name, so it is the one correcting it.
    expect(gasto.authorDisplayName).toBe('Ada')
    expect(gasto.memberId).toBe('user-1')
  })

  it('refuses one whose cuota is in a Resumen already paid', async () => {
    const s = await setup()
    const consumo = await purchase(s, {
      cuotas: 1,
      purchaseDate: new Date(2026, 7, 5),
    })
    const resumenes = await listPendientesForMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    const resumen = resumenes.find((one) => one.cardId === s.visa.id)
    if (resumen === undefined) throw new Error('expected a Resumen')
    await markResumenPaid({
      db: s.db,
      householdId: s.householdId,
      resumenId: resumen.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      amountPaid: 300,
      paymentDate: new Date(2026, 8, 10),
    })

    await expect(takeOffTheCard(s, consumo.id)).rejects.toThrow(
      CardPurchaseLockedError,
    )
  })

  it('refuses the consumo that is the payment of a servicio', async () => {
    const s = await setup()
    const bill = await createPendiente({
      db: s.db,
      householdId: s.householdId,
      categoryId: s.comidaId,
      name: 'Claro',
      dueDate: new Date(2026, 8, 15),
      expectedAmount: 12_000,
    })
    const { purchase: consumo } = await markPendientePaidWithCard({
      db: s.db,
      householdId: s.householdId,
      pendienteId: bill.id,
      cardId: s.visa.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 12_000,
      cuotas: 1,
      paymentDate: new Date(2026, 8, 15),
      currency: 'ARS',
    })

    await expect(takeOffTheCard(s, consumo.id)).rejects.toThrow(
      ConsumoFromServicioError,
    )
    // And nothing was written on the way to refusing.
    const expenses = await listExpensesInMonth({
      db: s.db,
      householdId: s.householdId,
      ...monthRange(2026, 8),
    })
    expect(expenses).toHaveLength(0)
  })

  it('refuses one that is not there', async () => {
    const s = await setup()

    await expect(takeOffTheCard(s, 'nope')).rejects.toThrow(
      CardPurchaseNotFoundError,
    )
  })
})

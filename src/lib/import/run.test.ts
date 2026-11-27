import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createCard, listCards, listCardPurchasesInMonth } from '@/lib/cards'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import { listPendientes, listPendientesForMonth } from '@/lib/pendientes'
import { planImport } from './plan'
import { runImport } from './run'
import type { ImportResult } from './run'

const TODAY = new Date(2026, 10, 27, 12)
const NOVEMBER = {
  monthStart: new Date(2026, 10, 1),
  monthEnd: new Date(2026, 11, 1),
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  vi.useRealTimers()
})

const HEAD =
  'Fecha;Movimiento;Categoría;Monto;Moneda;Método;Pagado;Todos los meses;Débito automático;Cuotas;Comentario'

async function setup(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly importFile: (...lines: string[]) => Promise<ImportResult>
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 500000,
  })
  const householdId = household.id
  await createCard({
    db,
    householdId,
    name: 'Visa Crédito',
    kind: 'credito',
    currency: 'BOTH',
  })

  const importFile = async (...lines: string[]) => {
    const [categories, methods] = await Promise.all([
      listCategories({ db, householdId }),
      listCards({ db, householdId }),
    ])
    const { rows } = planImport({
      text: [HEAD, ...lines].join('\n'),
      categories,
      methods,
    })
    return runImport({
      db,
      householdId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      rows,
    })
  }

  return { db, householdId, importFile }
}

describe('runImport', () => {
  it('writes a paid one-off as a gasto of its month', async () => {
    const { db, householdId, importFile } = await setup()
    const result = await importFile(
      '11/11/2026;Café Martinez;Café;4.600;;;;;;;',
    )
    expect(result).toEqual({ written: 1, failed: [] })

    const expenses = await listExpensesInMonth({ db, householdId, ...NOVEMBER })
    expect(expenses).toHaveLength(1)
    expect(expenses[0]).toMatchObject({ name: 'Café Martinez', price: 4600 })
  })

  it('puts a credit-card row on the card and not in the month', async () => {
    const { db, householdId, importFile } = await setup()
    await importFile(
      '13/11/2026;Discos;Entretenimiento;104.500;ARS;Visa Crédito;sí;no;no;3;',
    )

    const expenses = await listExpensesInMonth({ db, householdId, ...NOVEMBER })
    expect(expenses).toEqual([])
    const purchases = await listCardPurchasesInMonth({
      db,
      householdId,
      ...NOVEMBER,
    })
    expect(purchases).toHaveLength(1)
    expect(purchases[0]).toMatchObject({
      name: 'Discos',
      total: 104500,
      cuotas: 3,
    })
  })

  it('opens a servicio that is still owed, with no money moved', async () => {
    const { db, householdId, importFile } = await setup()
    await importFile('14/11/2026;Swiss Medical;Salud;;;;no;sí;;;')

    const bills = await listPendientes({ db, householdId })
    expect(bills).toHaveLength(1)
    expect(bills[0]).toMatchObject({
      name: 'Swiss Medical',
      status: 'pending',
      expectedAmount: null,
      recurring: true,
    })
    expect(await listExpensesInMonth({ db, householdId, ...NOVEMBER })).toEqual(
      [],
    )
  })

  it('settles a servicio that was already paid, and writes its gasto', async () => {
    const { db, householdId, importFile } = await setup()
    const result = await importFile(
      '16/11/2026;Seguro;Auto;182.149;;;sí;sí;sí;;',
    )
    expect(result.failed).toEqual([])

    const bills = await listPendientesForMonth({ db, householdId, ...NOVEMBER })
    expect(bills[0]).toMatchObject({ status: 'paid', autoDebit: true })
    const expenses = await listExpensesInMonth({ db, householdId, ...NOVEMBER })
    expect(expenses[0]).toMatchObject({ name: 'Seguro', price: 182149 })
  })

  it('settles a servicio paid with a credit card onto the card', async () => {
    const { db, householdId, importFile } = await setup()
    const result = await importFile(
      '11/11/2026;Claro;Casa;11.998,01;ARS;Visa Crédito;sí;sí;sí;1;',
    )
    expect(result.failed).toEqual([])

    // Paying with a card also opens that card's Resumen, which is a bill of
    // its own, so the servicio is found by name rather than by position.
    const bills = await listPendientesForMonth({ db, householdId, ...NOVEMBER })
    expect(bills.find((bill) => bill.name === 'Claro')?.status).toBe('paid')
    // On the card, so it is not money that left this month.
    expect(await listExpensesInMonth({ db, householdId, ...NOVEMBER })).toEqual(
      [],
    )
    const purchases = await listCardPurchasesInMonth({
      db,
      householdId,
      ...NOVEMBER,
    })
    expect(purchases[0]).toMatchObject({ name: 'Claro' })
  })

  it('creates a category the file names once, however many rows use it', async () => {
    const { db, householdId, importFile } = await setup()
    await importFile(
      '27/11/2026;Bazar;Bolucompras;43.100;;;;;;;',
      '27/11/2026;Cotillón;Bolucompras;26.300;;;;;;;',
    )
    const categories = await listCategories({ db, householdId })
    expect(categories.filter((one) => one.name === 'Bolucompras')).toHaveLength(
      1,
    )
  })

  it('keeps what it wrote when one row fails, and says which', async () => {
    const { db, householdId } = await setup()
    const [categories, methods] = await Promise.all([
      listCategories({ db, householdId }),
      listCards({ db, householdId }),
    ])
    const { rows } = planImport({
      text: [HEAD, '11/11/2026;Café;Café;4.600;;;;;;;'].join('\n'),
      categories,
      methods,
    })
    const good = rows[0]
    if (good === undefined) throw new Error('expected a planned row')
    const broken = [good, { ...good, line: 3, categoryId: 'cat-que-no-existe' }]
    const result = await runImport({
      db,
      householdId,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      rows: broken,
    })
    expect(result.written).toBe(1)
    expect(result.failed[0]?.line).toBe(3)
    expect(
      await listExpensesInMonth({ db, householdId, ...NOVEMBER }),
    ).toHaveLength(1)
  })

  it('records a dollar row in dollars', async () => {
    const { db, householdId, importFile } = await setup()
    await importFile(
      '24/11/2026;Anthropic;Suscripciones;20;USD;Visa Crédito;sí;;;;',
    )
    const purchases = await listCardPurchasesInMonth({
      db,
      householdId,
      ...NOVEMBER,
    })
    expect(purchases[0]).toMatchObject({ currency: 'USD', total: 20 })
  })
})

import { createCard, createCardPurchase, markResumenPaid } from '@/lib/cards'
import {
  createExpense,
  findOrCreateCategory,
  updateCategoryBudget,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  createPendiente,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'

export const DEMO_USER_ID = 'demo-user'
export const DEMO_AUTHOR = 'Jlors'

export type DemoScenario = 'nueva' | 'completa'

export function scenarioFromSearch(search: string): DemoScenario {
  return new URLSearchParams(search).get('seed') === 'completa'
    ? 'completa'
    : 'nueva'
}

function dayThisMonth(day: number): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), day)
}

// For what already happened (gastos, payments): never later than today, which
// would be a future date the app rejects early in the month.
function pastDayThisMonth(day: number): Date {
  return dayThisMonth(Math.min(day, new Date().getDate()))
}

// A household that has just signed up: a name, no budget, and nothing
// logged. This is the default, and the whole point of the demo -- it is the
// one state the real app can never be put back into once it has been used.
async function seedNueva(db: HouseholdsDb): Promise<void> {
  await createHouseholdWithMembership({
    db,
    userId: DEMO_USER_ID,
    name: 'Casa nueva',
    monthlyBudget: 0,
    displayName: DEMO_AUTHOR,
  })
}

// A household mid-month, for looking at anything the empty one cannot show:
// the budget heat, the carousels, the category donut, paid vs pending.
async function seedCompleta(db: HouseholdsDb): Promise<void> {
  const household = await createHouseholdWithMembership({
    db,
    userId: DEMO_USER_ID,
    name: 'Casa Merlo',
    monthlyBudget: 900000,
    displayName: DEMO_AUTHOR,
  })
  const householdId = household.id

  const categoryFor = async (name: string) =>
    findOrCreateCategory({ db, householdId, name })

  const comida = await categoryFor('Comida')
  const servicios = await categoryFor('Servicios')
  const transporte = await categoryFor('Transporte')
  const salud = await categoryFor('Salud')
  const ropa = await categoryFor('Ropa')

  // Ceilings on the few categories a household actually wants to move
  // carefully inside -- one comfortably inside it, one already over.
  await updateCategoryBudget({
    db,
    householdId,
    categoryId: comida.id,
    monthlyBudget: 120000,
  })
  await updateCategoryBudget({
    db,
    householdId,
    categoryId: transporte.id,
    monthlyBudget: 50000,
  })

  const gastos: readonly {
    readonly name: string
    readonly price: number
    readonly categoryId: string
    readonly day: number
  }[] = [
    { name: 'Supermercado', price: 48350.5, categoryId: comida.id, day: 3 },
    { name: 'Verdulería', price: 12400, categoryId: comida.id, day: 6 },
    { name: 'SUBE', price: 9000, categoryId: transporte.id, day: 7 },
    { name: 'Farmacia', price: 23100, categoryId: salud.id, day: 9 },
    { name: 'Nafta', price: 54000, categoryId: transporte.id, day: 11 },
  ]
  for (const gasto of gastos) {
    await createExpense({
      db,
      householdId,
      categoryId: gasto.categoryId,
      memberId: DEMO_USER_ID,
      authorDisplayName: DEMO_AUTHOR,
      name: gasto.name,
      price: gasto.price,
      comments: '',
      expenseDate: pastDayThisMonth(gasto.day),
    })
  }

  const bills: readonly {
    readonly name: string
    readonly amount: number
    readonly day: number
    readonly autoDebit: boolean
    readonly paid: boolean
  }[] = [
    { name: 'Alquiler', amount: 420000, day: 10, autoDebit: false, paid: true },
    { name: 'Internet', amount: 42000, day: 20, autoDebit: true, paid: false },
    { name: 'Expensas', amount: 88000, day: 15, autoDebit: false, paid: false },
    { name: 'Gas', amount: 31500, day: 24, autoDebit: false, paid: false },
  ]
  for (const bill of bills) {
    const created = await createPendiente({
      db,
      householdId,
      categoryId: servicios.id,
      name: bill.name,
      dueDate: dayThisMonth(bill.day),
      expectedAmount: bill.amount,
      recurring: true,
      autoDebit: bill.autoDebit,
    })
    if (bill.paid) {
      await markPendientePaid({
        db,
        householdId,
        pendienteId: created.id,
        memberId: DEMO_USER_ID,
        authorDisplayName: DEMO_AUTHOR,
        finalAmount: bill.amount,
        paymentDate: pastDayThisMonth(bill.day),
      })
    }
  }
  // Two cards, so the Tarjeta slice has both a paid Resumen (Visa, paid with
  // a small ajuste) and an unpaid one (Master, in Por pagar). Purchases are
  // dated last month: cuota 1 lands in this month's Resumen, and the 3-cuota
  // one keeps going into the next months.
  const today = new Date()
  const lastMonth = (day: number) =>
    new Date(today.getFullYear(), today.getMonth() - 1, day)
  const visa = await createCard({ db, householdId, name: 'Visa' })
  const master = await createCard({ db, householdId, name: 'Master' })
  const compras: readonly {
    readonly cardId: string
    readonly name: string
    readonly total: number
    readonly cuotas: number
    readonly categoryId: string
    readonly day: number
  }[] = [
    {
      cardId: visa.id,
      name: 'Zapatillas',
      total: 90000,
      cuotas: 3,
      categoryId: ropa.id,
      day: 12,
    },
    {
      cardId: visa.id,
      name: 'Mayorista',
      total: 36500,
      cuotas: 1,
      categoryId: comida.id,
      day: 20,
    },
    {
      cardId: master.id,
      name: 'Service del auto',
      total: 64000,
      cuotas: 1,
      categoryId: transporte.id,
      day: 18,
    },
    {
      cardId: master.id,
      name: 'Óptica',
      total: 45000,
      cuotas: 2,
      categoryId: salud.id,
      day: 25,
    },
  ]
  for (const compra of compras) {
    await createCardPurchase({
      db,
      householdId,
      cardId: compra.cardId,
      categoryId: compra.categoryId,
      memberId: DEMO_USER_ID,
      authorDisplayName: DEMO_AUTHOR,
      name: compra.name,
      total: compra.total,
      cuotas: compra.cuotas,
      purchaseDate: lastMonth(compra.day),
      comments: '',
    })
  }
  const visaResumen = (await listPendientes({ db, householdId })).find(
    (pendiente) =>
      pendiente.cardId === visa.id &&
      pendiente.dueDate.getMonth() === today.getMonth(),
  )
  if (visaResumen?.expectedAmount != null) {
    await markResumenPaid({
      db,
      householdId,
      resumenId: visaResumen.id,
      memberId: DEMO_USER_ID,
      authorDisplayName: DEMO_AUTHOR,
      // A little interest on top: the difference becomes the ajuste.
      amountPaid: visaResumen.expectedAmount + 1850,
      paymentDate: today,
    })
  }
}

export async function seedDemoHousehold(input: {
  readonly db: HouseholdsDb
  readonly scenario: DemoScenario
}): Promise<void> {
  return input.scenario === 'completa'
    ? seedCompleta(input.db)
    : seedNueva(input.db)
}

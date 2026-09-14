import { createExpense, findOrCreateCategory } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'

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
      expenseDate: dayThisMonth(gasto.day),
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
        paymentDate: dayThisMonth(bill.day),
      })
    }
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

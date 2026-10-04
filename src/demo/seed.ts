import {
  createCard,
  createCardPurchase,
  markResumenPaid,
  setResumenAmount,
} from '@/lib/cards'
import {
  computePendingCommitted,
  computeSpentThisMonth,
  createExpense,
  currentMonthRange,
  deleteCategory,
  findOrCreateCategory,
  listCategories,
  listExpensesInMonth,
  updateCategoryBudget,
} from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  updateHouseholdBudget,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  createPendiente,
  listPendientes,
  markPendientePaid,
  pendientesDueInMonth,
} from '@/lib/pendientes'

export const DEMO_USER_ID = 'demo-user'
export const DEMO_AUTHOR = 'Jlors'

export type SeedUser = { readonly id: string; readonly displayName: string }

const DEMO_USER: SeedUser = { id: DEMO_USER_ID, displayName: DEMO_AUTHOR }

// One scenario per thing worth looking at. The budget states are the same
// household with the same movements and a different monthly budget -- what
// changes between them is only how much of the month is gone, which is
// exactly what the card's colour is a function of.
export const DEMO_SCENARIOS = {
  nueva: { label: 'cuenta nueva' },
  vacia: { label: 'casa vacía' },
  arranque: { label: 'recién arranca · 10%' },
  mitad: { label: 'va bien · 50%' },
  ajustada: { label: 'ajustada · 80%' },
  completa: { label: 'casa con datos · 96%' },
  pasada: { label: 'en negativo · 118%' },
  muchas: { label: '17 categorías' },
} as const

export type DemoScenario = keyof typeof DEMO_SCENARIOS

function isScenario(value: string | null): value is DemoScenario {
  return value !== null && value in DEMO_SCENARIOS
}

export function scenarioFromSearch(search: string): DemoScenario {
  const asked = new URLSearchParams(search).get('seed')
  return isScenario(asked) ? asked : 'nueva'
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

// Relative to today rather than a fixed day of the month: "Vencimientos que
// se acercan" only shows what is due inside the next week, so a demo pinned
// to the 15th shows an empty section for three weeks of every month.
function inDays(days: number): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days)
}

// A household that has just signed up: a name, no budget, and nothing
// logged. This is the default, and the whole point of the demo -- it is the
// one state the real app can never be put back into once it has been used.
async function seedNueva(db: HouseholdsDb, user: SeedUser): Promise<void> {
  await createHouseholdWithMembership({
    db,
    userId: user.id,
    name: 'Casa nueva',
    monthlyBudget: 0,
    displayName: user.displayName,
  })
}

// A household mid-month, for looking at anything the empty one cannot show:
// the budget heat, the carousels, the category donut, paid vs pending.
// A household with its six default categories removed and nothing logged:
// the one state that shows every empty state at once, which even a brand-new
// account does not (it opens with the defaults already in it).
async function seedVacia(db: HouseholdsDb, user: SeedUser): Promise<void> {
  const household = await createHouseholdWithMembership({
    db,
    userId: user.id,
    name: 'Casa vacía',
    monthlyBudget: 0,
    displayName: user.displayName,
  })
  for (const category of await listCategories({
    db,
    householdId: household.id,
  })) {
    await deleteCategory({
      db,
      householdId: household.id,
      categoryId: category.id,
    })
  }
}

// Nine more on top of the eight seedCasa already makes, for looking at what
// the colours do at the scale a real household actually reaches.
const EXTRA_CATEGORIES = [
  'Educación',
  'Regalos',
  'Suscripciones',
  'Farmacia',
  'Gimnasio',
  'Viajes',
  'Impuestos',
  'Librería',
  'Peluquería',
] as const

async function seedCasa(
  db: HouseholdsDb,
  user: SeedUser,
  options: {
    // What share of the budget the month should end up having used. The
    // movements below are fixed; the budget is solved for from them, so
    // every scenario is the same household seen at a different heat.
    readonly percentUsed: number
    readonly name: string
    readonly manyCategories?: boolean
  },
): Promise<void> {
  const household = await createHouseholdWithMembership({
    db,
    userId: user.id,
    name: options.name,
    monthlyBudget: 900000,
    displayName: user.displayName,
  })
  const householdId = household.id

  const categoryFor = async (name: string) =>
    findOrCreateCategory({ db, householdId, name })

  const comida = await categoryFor('Comida')
  const servicios = await categoryFor('Servicios')
  const transporte = await categoryFor('Transporte')
  const salud = await categoryFor('Salud')
  const ropa = await categoryFor('Ropa')
  const casa = await categoryFor('Casa')
  const ocio = await categoryFor('Ocio')
  const mascotas = await categoryFor('Mascotas')
  if (options.manyCategories === true) {
    for (const [index, name] of EXTRA_CATEGORIES.entries()) {
      const extra = await categoryFor(name)
      await createExpense({
        db,
        householdId,
        categoryId: extra.id,
        memberId: user.id,
        authorDisplayName: user.displayName,
        name,
        price: 9000 + index * 2600,
        comments: '',
        expenseDate: pastDayThisMonth(2 + index),
      })
    }
  }

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
    { name: 'Ferretería', price: 18700, categoryId: casa.id, day: 4 },
    { name: 'Cine', price: 16000, categoryId: ocio.id, day: 8 },
    {
      name: 'Alimento del perro',
      price: 27400,
      categoryId: mascotas.id,
      day: 5,
    },
    { name: 'Panadería', price: 6800, categoryId: comida.id, day: 12 },
    { name: 'Peluquería', price: 21000, categoryId: salud.id, day: 13 },
    { name: 'Bar con amigos', price: 34500, categoryId: ocio.id, day: 14 },
  ]
  for (const gasto of gastos) {
    await createExpense({
      db,
      householdId,
      categoryId: gasto.categoryId,
      memberId: user.id,
      authorDisplayName: user.displayName,
      name: gasto.name,
      price: gasto.price,
      comments: '',
      expenseDate: pastDayThisMonth(gasto.day),
    })
  }

  // dueIn is days from today, so two of these always land inside the
  // "Vencimientos que se acercan" window (7 days) whatever day the demo is
  // opened on -- a fixed day of the month left that section empty for most
  // of every month.
  const bills: readonly {
    readonly name: string
    readonly amount: number
    readonly dueIn: number
    readonly autoDebit: boolean
    readonly paid: boolean
    readonly categoryId: string
  }[] = [
    {
      name: 'Alquiler',
      amount: 420000,
      dueIn: -4,
      autoDebit: false,
      paid: true,
      categoryId: casa.id,
    },
    {
      name: 'Luz',
      amount: 36800,
      dueIn: 1,
      autoDebit: false,
      paid: false,
      categoryId: servicios.id,
    },
    {
      name: 'Expensas',
      amount: 88000,
      dueIn: 4,
      autoDebit: false,
      paid: false,
      categoryId: casa.id,
    },
    {
      name: 'Internet',
      amount: 42000,
      dueIn: 11,
      autoDebit: true,
      paid: false,
      categoryId: servicios.id,
    },
    {
      name: 'Gas',
      amount: 31500,
      dueIn: 16,
      autoDebit: false,
      paid: false,
      categoryId: servicios.id,
    },
    {
      name: 'Prepaga',
      amount: 164000,
      dueIn: 19,
      autoDebit: true,
      paid: false,
      categoryId: salud.id,
    },
  ]
  for (const bill of bills) {
    const created = await createPendiente({
      db,
      householdId,
      categoryId: bill.categoryId,
      name: bill.name,
      dueDate: inDays(bill.dueIn),
      expectedAmount: bill.amount,
      recurring: true,
      autoDebit: bill.autoDebit,
    })
    if (bill.paid) {
      await markPendientePaid({
        db,
        householdId,
        pendienteId: created.id,
        memberId: user.id,
        authorDisplayName: user.displayName,
        finalAmount: bill.amount,
        paymentDate: inDays(bill.dueIn),
      })
    }
  }
  // A dollar gasto paid with no card at all -- recorded, labelled, and
  // left out of the budget.
  await createExpense({
    db,
    householdId,
    categoryId: servicios.id,
    memberId: user.id,
    authorDisplayName: user.displayName,
    name: 'Hosting',
    price: 45,
    comments: '',
    expenseDate: pastDayThisMonth(8),
    currency: 'USD',
  })
  // Two cards, so the Tarjeta slice has both a paid Resumen (Visa, paid with
  // a small ajuste) and an unpaid one (Master, in Por pagar). Purchases are
  // dated last month: cuota 1 lands in this month's Resumen, and the 3-cuota
  // one keeps going into the next months.
  const today = new Date()
  const lastMonth = (day: number) =>
    new Date(today.getFullYear(), today.getMonth() - 1, day)
  const visa = await createCard({
    db,
    householdId,
    name: 'Visa',
    brand: 'visa',
  })
  const master = await createCard({
    db,
    householdId,
    name: 'Master',
    brand: 'mastercard',
  })
  // Billed in both currencies, like most real ones: it ends up with two
  // Resúmenes this month, and the dollar one never touches the budget.
  const amex = await createCard({
    db,
    householdId,
    name: 'Amex',
    currency: 'BOTH',
    brand: 'amex',
  })
  // Not every method is a credit card: a Mercado Pago balance you spend
  // straight out of, and a dollar debit card for the money that is already
  // abroad. Both settle the moment a gasto is logged, so they make an
  // ordinary gasto of this month rather than a Resumen of the next.
  const mercadoPago = await createCard({
    db,
    householdId,
    name: 'Mercado Pago',
    kind: 'cuenta',
    brand: 'mercadopago',
  })
  await createCard({
    db,
    householdId,
    name: 'Mercury',
    kind: 'debito',
    currency: 'USD',
    brand: 'otra',
  })
  // Paid out of the Mercado Pago balance: an ordinary gasto of this month,
  // with the method named on its row.
  await createExpense({
    db,
    householdId,
    categoryId: comida.id,
    memberId: user.id,
    authorDisplayName: user.displayName,
    name: 'Delivery',
    price: 18500,
    comments: '',
    expenseDate: pastDayThisMonth(3),
    paymentMethodId: mercadoPago.id,
  })
  const compras: readonly {
    readonly cardId: string
    readonly name: string
    readonly total: number
    readonly cuotas: number
    readonly categoryId: string
    readonly day: number
    readonly currency?: 'ARS' | 'USD'
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
    {
      cardId: amex.id,
      name: 'Mercado Libre',
      total: 78000,
      cuotas: 1,
      categoryId: casa.id,
      day: 22,
    },
    // The dollar half of the same card: its own Resumen, recorded and
    // labelled, and counted in no peso total anywhere in the app. In two
    // cuotas so one lands in this month's Resumen and one in next month's
    // -- which is what puts a dollar figure in "Tarjetas el mes que viene"
    // beside the peso one, the case that used to show nothing at all.
    {
      cardId: amex.id,
      name: 'Suscripción anual',
      total: 240,
      cuotas: 2,
      categoryId: ocio.id,
      day: 14,
      currency: 'USD',
    },
  ]
  for (const compra of compras) {
    await createCardPurchase({
      db,
      householdId,
      cardId: compra.cardId,
      categoryId: compra.categoryId,
      memberId: user.id,
      authorDisplayName: user.displayName,
      name: compra.name,
      total: compra.total,
      cuotas: compra.cuotas,
      purchaseDate: lastMonth(compra.day),
      comments: '',
      ...(compra.currency === undefined ? {} : { currency: compra.currency }),
    })
  }
  // The budget is set last, from what the month actually came to: every
  // scenario runs the same movements and only the ceiling moves, so the
  // heat on the card is the one thing that differs between them.
  const pendientes = await listPendientes({ db, householdId })
  const spent = computeSpentThisMonth(
    await listExpensesInMonth({ db, householdId, ...currentMonthRange() }),
  )
  const { monthStart, monthEnd } = currentMonthRange()
  const committed = computePendingCommitted(
    pendientesDueInMonth(pendientes, monthStart, monthEnd),
  )
  await updateHouseholdBudget({
    db,
    householdId,
    monthlyBudget:
      Math.round((spent + committed) / (options.percentUsed / 100) / 1000) *
      1000,
  })

  const visaResumen = (await listPendientes({ db, householdId })).find(
    (pendiente) =>
      pendiente.cardId === visa.id &&
      pendiente.dueDate.getMonth() === today.getMonth(),
  )
  // Visa's statement arrived and was paid; Master's and the two Amex ones
  // are still waiting, so the demo carries both halves of the model: a
  // Resumen that is a real bill, and ones that are only an estimate of
  // what the household has been logging.
  if (visaResumen !== undefined) {
    const billed = (visaResumen.estimatedAmount ?? 0) + 1850
    await setResumenAmount({
      db,
      householdId,
      resumenId: visaResumen.id,
      // The card billed a little more than was logged: that gap is the
      // whole reason the two figures exist.
      amount: billed,
    })
    await markResumenPaid({
      db,
      householdId,
      resumenId: visaResumen.id,
      memberId: user.id,
      authorDisplayName: user.displayName,
      amountPaid: billed,
      paymentDate: today,
    })
  }
}

export async function seedDemoHousehold(input: {
  readonly db: HouseholdsDb
  readonly scenario: DemoScenario
  // Who the household belongs to; the demo user unless seeding a real
  // Firebase project (see seedFirebase.ts).
  readonly user?: SeedUser
}): Promise<void> {
  const user = input.user ?? DEMO_USER
  const { db } = input
  switch (input.scenario) {
    case 'nueva':
      return seedNueva(db, user)
    case 'vacia':
      return seedVacia(db, user)
    case 'arranque':
      return seedCasa(db, user, { percentUsed: 10, name: 'Casa Merlo' })
    case 'mitad':
      return seedCasa(db, user, { percentUsed: 50, name: 'Casa Merlo' })
    case 'ajustada':
      return seedCasa(db, user, { percentUsed: 80, name: 'Casa Merlo' })
    case 'pasada':
      return seedCasa(db, user, { percentUsed: 118, name: 'Casa Merlo' })
    case 'muchas':
      return seedCasa(db, user, {
        percentUsed: 62,
        name: 'Casa Merlo',
        manyCategories: true,
      })
    case 'completa':
      return seedCasa(db, user, { percentUsed: 96, name: 'Casa Merlo' })
  }
}

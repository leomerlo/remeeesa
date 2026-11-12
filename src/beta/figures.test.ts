import { beforeAll, describe, expect, it } from 'vitest'
import { cuotasOf } from '@/lib/cards/cuotas'
import type { Card, CardPurchase } from '@/lib/cards'
import { currentMonthRange, isServicio } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { Household } from '@/lib/households'
import { amountLeft } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import type { Projection } from '@/lib/proyecciones'
import { DEMO_SCENARIOS, DEMO_USER_ID, seedDemoHousehold } from '@/demo/seed'
import type { DemoScenario } from '@/demo/seed'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  cardCategoryIds,
  categoryMovements,
  cuotaInMonth,
  categoriasFigures,
  serviciosFigures,
  gastosFigures,
  homeFigures,
  projectionFigures,
  sumIn,
} from './figures'
import type { Movement } from './figures'

// The arithmetic audit.
//
// Every screen of the beta is a different arrangement of the same month,
// so the things worth testing are not any one figure but the relations
// between them: that the hero equals its own legend, that Inicio and
// Gastos say the same total, that no peso figure anywhere has a dollar
// inside it, that a purchase in six cuotas adds back up to itself.
//
// It runs over every seeded household rather than over invented inputs,
// because the errors that actually happened -- a dollar expense summed as
// pesos, a bill of another month eating into this one's budget -- were all
// of the kind that only appears when the data is shaped like a real
// household's.

type Snapshot = {
  readonly household: Household
  readonly categories: readonly Category[]
  readonly cards: readonly Card[]
  // The same list under the name the figures ask for it by: there they
  // are not "the cards" but every way the household pays, which is what
  // says whether a bill comes out of the month or goes onto a card.
  readonly methods: readonly Card[]
  readonly expenses: readonly Expense[]
  // The same list under the name projectionFigures asks for it by.
  readonly current: readonly Expense[]
  readonly previous: readonly Expense[]
  readonly allExpenses: readonly Expense[]
  readonly purchases: readonly CardPurchase[]
  readonly pendientes: readonly Pendiente[]
  readonly projection: Projection | null
  // The month's already-paid bills, under the name serviciosFigures asks
  // for them by.
  readonly settled: readonly Pendiente[]
  // Per Resumen: what the cuotas it names come to in its own month. The
  // figure the Tarjetas tab adds up from the rows it lists.
  readonly resumenCuotas: ReadonlyMap<string, number>
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly now: Date
}

// `anchor` is the month on screen; `now` is always really now. Keeping
// them apart is the point -- paging back to a month that has ended is the
// case where the figures have to stop talking about days left.
async function snapshot(
  scenario: DemoScenario,
  anchor: Date,
  now: Date,
): Promise<Snapshot> {
  const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)
  await seedDemoHousehold({ db, scenario })
  const membership = await db.getMembership(DEMO_USER_ID)
  if (membership === null) {
    throw new Error(`Scenario ${scenario} seeded no household`)
  }
  const householdId = membership.householdId
  const { monthStart, monthEnd } = currentMonthRange(anchor)
  const previousRange = currentMonthRange(
    new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1),
  )
  const [
    household,
    categories,
    cards,
    expenses,
    previous,
    allExpenses,
    purchases,
    settled,
    pendientes,
    projection,
  ] = await Promise.all([
    db.getHousehold(householdId),
    db.listCategories(householdId),
    db.listCards({ householdId }),
    db.listExpensesInMonth({ householdId, monthStart, monthEnd }),
    db.listExpensesInMonth({ householdId, ...previousRange }),
    db.listAllExpenses({ householdId }),
    // The window the figures read, not the month: a purchase in cuotas
    // goes on counting in the months that pay it off.
    db.listCardPurchasesInMonth({
      householdId,
      monthStart: new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() - 24,
        1,
      ),
      monthEnd,
    }),
    db.listPaidPendientesDueInMonth({ householdId, monthStart, monthEnd }),
    db.listPendientes({ householdId }),
    db.getProjection({ householdId, monthStart }),
  ])
  const resumenCuotas = new Map<string, number>()
  for (const resumen of pendientes) {
    if (resumen.cardId === undefined) continue
    const behind = await db.getCardPurchases({
      householdId,
      purchaseIds: resumen.purchaseIds ?? [],
    })
    const year = resumen.dueDate.getFullYear()
    const month = resumen.dueDate.getMonth()
    let total = 0
    for (const purchase of behind) {
      const cuota = cuotasOf(purchase).find(
        (candidate) =>
          candidate.monthStart.getFullYear() === year &&
          candidate.monthStart.getMonth() === month,
      )
      if (cuota !== undefined) total += Math.round(cuota.amount * 100)
    }
    resumenCuotas.set(resumen.id, total)
  }

  return {
    household,
    categories,
    cards,
    methods: cards,
    expenses,
    current: expenses,
    previous,
    allExpenses,
    purchases,
    pendientes,
    projection,
    settled,
    resumenCuotas,
    monthStart,
    monthEnd,
    now,
  }
}

// Every scenario that seeds a household. "alta" deliberately seeds none --
// it is the demo of the sign-up, where there is no month to say anything
// about yet.
const SCENARIOS = (
  Object.keys(DEMO_SCENARIOS) as readonly DemoScenario[]
).filter((scenario) => scenario !== 'alta')

// Today, the month before it, and a month far enough back that nothing was
// seeded into it -- the three cases a month pager can land on.
const THIS_MONTH = new Date()
const LAST_MONTH = new Date(
  THIS_MONTH.getFullYear(),
  THIS_MONTH.getMonth() - 1,
  15,
)
const LONG_AGO = new Date(THIS_MONTH.getFullYear() - 1, 2, 15)

const cents = (value: number): number => Math.round(value * 100)

describe('the beta says the same month on every screen', () => {
  const snapshots = new Map<string, Snapshot>()

  beforeAll(async () => {
    for (const scenario of SCENARIOS) {
      for (const [label, anchor] of [
        ['este mes', THIS_MONTH],
        ['el mes pasado', LAST_MONTH],
        ['un mes sin nada', LONG_AGO],
      ] as const) {
        snapshots.set(
          `${scenario}·${label}`,
          await snapshot(scenario, anchor, THIS_MONTH),
        )
      }
    }
  })

  const each = (
    name: string,
    check: (snap: Snapshot, key: string) => void,
  ): void => {
    it(name, () => {
      for (const [key, snap] of snapshots) {
        check(snap, key)
      }
    })
  }

  // Every check below walks the same map, so a map that came back empty
  // would pass all of them and prove nothing. This is the one that says
  // there was something to check: all eight households, in three months
  // each, and between them a real example of every shape the rest of this
  // file is about.
  it('has a real household in front of it', () => {
    expect(snapshots.size).toBe(SCENARIOS.length * 3)

    const all = [...snapshots.values()]
    const homes = all.map((snap) => homeFigures(snap))
    expect(homes.some((home) => home.budget > 0)).toBe(true)
    expect(homes.some((home) => home.paid > 0)).toBe(true)
    expect(homes.some((home) => home.owed > 0)).toBe(true)
    expect(homes.some((home) => home.left < 0)).toBe(true)
    expect(homes.some((home) => home.closed)).toBe(true)
    expect(homes.some((home) => !home.closed)).toBe(true)
    expect(homes.some((home) => home.cards.length > 0)).toBe(true)
    expect(homes.some((home) => home.byCategory.length >= 13)).toBe(true)

    // A purchase split into cuotas, and money in dollars: the two shapes
    // that have caused every arithmetic error so far.
    expect(
      all.some((snap) =>
        snap.purchases.some((purchase) => purchase.cuotas > 1),
      ),
    ).toBe(true)
    expect(
      all.some(
        (snap) =>
          sumIn(snap.expenses, 'USD') > 0 ||
          snap.pendientes.some((bill) => bill.currency === 'USD'),
      ),
    ).toBe(true)
  })

  // No seeded household has a bill left unpaid from an earlier month, so
  // the rule -- an unpaid bill does not stay in its month, it follows the
  // household forward with a warning -- is built here rather than hoped
  // for. It is money this month has to find, whichever month it came
  // from: "si estoy arrastrando una deuda es parte del presupuesto de
  // este mes, porque la tengo que pagar de alguna forma".
  it('carries an unpaid bill forward and charges this month for it', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [first] = base.pendientes.filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.cardId === undefined &&
        (pendiente.currency ?? 'ARS') === 'ARS' &&
        pendiente.expectedAmount !== null,
    )
    if (first === undefined) throw new Error('no peso bill to carry')

    const owedBefore = homeFigures(base).owed
    const stale: Pendiente = {
      ...first,
      id: `${first.id}-vieja`,
      name: 'Luz de septiembre',
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth() - 2,
        8,
      ),
    }
    const snap: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, stale],
    }
    const home = homeFigures(snap)
    const cuentas = serviciosFigures(snap)

    // It shows, and it shows first.
    expect(home.late.map((bill) => bill.id)).toContain(stale.id)
    expect(home.bills[0]?.id).toBe(stale.id)
    expect(cuentas.bills[0]?.id).toBe(stale.id)

    // Both screens count it: it is owed now, whatever month it is from.
    expect(cents(cuentas.owed)).toBe(
      cents(serviciosFigures(base).owed) + cents(stale.expectedAmount ?? 0),
    )
    expect(cents(home.owed)).toBe(
      cents(owedBefore) + cents(stale.expectedAmount ?? 0),
    )
    // And Inicio can say how much of its figure is arrears, so a month
    // that has just inherited five of them says so rather than only
    // looking expensive.
    expect(cents(home.owedBefore)).toBe(cents(stale.expectedAmount ?? 0))
  })

  // A bill settled with a credit card is the one case where a bill and a
  // card meet. No seeded household has one -- the seed never calls
  // markPendientePaidWithCard -- so it is built here. The money has not
  // left: it is not in what the month paid, it is not in what the month
  // still owes, and it belongs beside the cards.
  it('puts a bill paid with a card on the card, not on the month', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [model] = base.pendientes.filter(
      (pendiente) =>
        pendiente.cardId === undefined &&
        (pendiente.currency ?? 'ARS') === 'ARS' &&
        pendiente.expectedAmount !== null,
    )
    if (model === undefined) throw new Error('no peso bill to model on')

    const onCard: Pendiente = {
      ...model,
      id: `${model.id}-con-tarjeta`,
      name: 'Prepaga con la Visa',
      status: 'paid',
      paidExpenseId: null,
      paidPurchaseId: 'compra-de-la-prepaga',
      paidAt: base.now,
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth(),
        12,
      ),
    }
    const snap: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, onCard],
    }
    const home = homeFigures(snap)
    const before = homeFigures(base)

    // Nothing about the month changed: it was not paid out of this
    // month's money and it is not owed either.
    expect(cents(home.paid)).toBe(cents(before.paid))
    expect(cents(home.owed)).toBe(cents(before.owed))
    expect(home.bills.map((bill) => bill.id)).not.toContain(onCard.id)

    // It is on the card, and counted there. Servicios reads it off the
    // month's settled bills, which is where a paid one lives.
    const servicios = serviciosFigures({ ...snap, settled: [onCard] })
    expect(servicios.onCard.map((bill) => bill.id)).toEqual([onCard.id])
    expect(cents(servicios.onCardTotal)).toBe(cents(onCard.expectedAmount ?? 0))
    expect(servicios.bills.map((bill) => bill.id)).not.toContain(onCard.id)

    // A bill paid the ordinary way is not on a card.
    expect(
      serviciosFigures({
        ...snap,
        settled: [{ ...onCard, paidPurchaseId: null, paidExpenseId: 'gasto' }],
      }).onCard,
    ).toEqual([])
  })

  // The same thing before the bank has taken it. Edenor on débito
  // automático with the Visa is a card expense from the moment it is set
  // up: the money is never going to leave this month, so it has no
  // business sitting among what this month still has to pay. It was, and
  // it only moved across once the bank charged it -- a month late.
  it('puts a bill a credit card pays on the card from the start', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const visa = base.cards.find((card) => card.kind === 'credito')
    if (visa === undefined) throw new Error('the seed has no credit card')
    const [model] = base.pendientes.filter(
      (pendiente) =>
        pendiente.cardId === undefined &&
        pendiente.status === 'pending' &&
        (pendiente.currency ?? 'ARS') === 'ARS' &&
        pendiente.expectedAmount !== null &&
        pendiente.dueDate >= base.monthStart &&
        pendiente.dueDate <= base.monthEnd,
    )
    if (model === undefined) throw new Error('no pending peso bill this month')

    const debited: Pendiente = {
      ...model,
      id: `${model.id}-por-la-visa`,
      name: 'Edenor por la Visa',
      paymentMethodId: visa.id,
    }
    const snap: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, debited],
    }
    const servicios = serviciosFigures(snap)
    const home = homeFigures(snap)

    // It is on the card's side, and nowhere on the month's.
    expect(servicios.onCard.map((bill) => bill.id)).toContain(debited.id)
    expect(servicios.unpaid.map((bill) => bill.id)).not.toContain(debited.id)
    expect(home.bills.map((bill) => bill.id)).not.toContain(debited.id)

    // And in no figure the month pays out of its own budget, on either
    // screen -- the two have to agree, or Inicio and Servicios are
    // describing different months.
    const before = serviciosFigures(base)
    expect(cents(servicios.owed)).toBe(cents(before.owed))
    expect(cents(home.owed)).toBe(cents(homeFigures(base).owed))
    expect(cents(servicios.onCardTotal)).toBe(
      cents(before.onCardTotal) + cents(debited.expectedAmount ?? 0),
    )
  })

  // Paging back used to show the same list whatever month was open: the
  // screen listed every unpaid bill the household had, of any month. A
  // month shows its own.
  each('Servicios shows the month it is open on', (snap, key) => {
    const month = serviciosFigures(snap)
    for (const bill of month.bills) {
      const carried = month.late.some((other) => other.id === bill.id)
      if (carried) continue
      expect(
        bill.dueDate >= snap.monthStart && bill.dueDate <= snap.monthEnd,
        `${key} · ${bill.name}`,
      ).toBe(true)
    }
    // Unpaid first, settled under them, and nothing in both halves.
    for (const bill of month.unpaid) expect(bill.status, key).toBe('pending')
    for (const bill of month.paid) expect(bill.status, key).toBe('paid')
    expect(month.bills.length, key).toBe(
      month.unpaid.length + month.paid.length,
    )
    // What is owed is what the unpaid half comes to, in pesos.
    expect(cents(month.owed), key).toBe(
      cents(
        sumIn(
          month.unpaid.map((bill) => ({
            price: amountLeft(bill) ?? 0,
            currency: bill.currency ?? 'ARS',
          })),
          'ARS',
        ),
      ),
    )
  })

  // A bill follows the household forward, not backward: a month that
  // closed without it never knew about it.
  each(
    'nothing is carried into a month that has already closed',
    (snap, key) => {
      const month = serviciosFigures(snap)
      const current = snap.now >= snap.monthStart && snap.now <= snap.monthEnd
      if (!current) {
        expect(month.late, key).toEqual([])
      }
      for (const bill of month.late) {
        expect(bill.dueDate < snap.monthStart, `${key} · ${bill.name}`).toBe(
          true,
        )
        expect(bill.status, `${key} · ${bill.name}`).toBe('pending')
      }
    },
  )

  // The hero says what is left; the legend under it says what it was
  // worked out from. If those two can disagree, the card is lying in its
  // own body text.
  each('the budget hero equals its own legend', (snap, key) => {
    const home = homeFigures(snap)
    expect(cents(home.left), key).toBe(
      cents(home.budget) - cents(home.paid) - cents(home.owed),
    )
  })

  // Inicio's "Pagado" is the month's whole figure; Gastos' total is only
  // lo de una vez, because paying a servicio belongs on Servicios and
  // showing it on both made one record read as two. So the two screens no
  // longer say the same number -- they say two halves of it, and the
  // thing worth auditing is that nothing falls between them.
  //
  // (They used to be the same sentence on two screens, and were off by
  // $45 for a month, which is what a dollar expense counted as pesos
  // looks like. That is what the peso-only sums below still guard.)
  each('Inicio is Gastos plus what the other two screens pay', (snap, key) => {
    const cards = cardCategoryIds(snap)
    // The two kinds of gasto that are not lo de una vez: paying a
    // servicio, which Servicios counts, and paying a card's Resumen,
    // which Tarjetas does.
    const elsewhere = cents(
      sumIn(
        snap.expenses
          .filter(
            (expense) => isServicio(expense) || cards.has(expense.categoryId),
          )
          .map((expense) => ({
            price: expense.price,
            currency: expense.currency ?? 'ARS',
          })),
        'ARS',
      ),
    )
    expect(cents(gastosFigures(snap).total) + elsewhere, key).toBe(
      cents(homeFigures(snap).paid),
    )
  })

  // The ring answers a different question from the card above it, and
  // this is the question, as an equation: what the month *consumed*. What
  // was paid, plus what it still owes, plus what went on a card -- and
  // minus the card's own Resumen being settled, which is last month's
  // shopping arriving and was already counted when it was bought.
  //
  // The café was drunk this month whoever pays the Visa next month. Per
  // direct feedback.
  each('the category ring is what the month consumed', (snap, key) => {
    const home = homeFigures(snap)
    const cards = cardCategoryIds(snap)
    const ring = home.byCategory.reduce((sum, row) => sum + cents(row.total), 0)

    const onTheCard = cents(
      sumIn(
        snap.expenses.filter((expense) => cards.has(expense.categoryId)),
        'ARS',
      ),
    )
    const resumenesDue = cents(
      sumIn(
        snap.pendientes
          .filter(
            (bill) =>
              bill.status === 'pending' &&
              bill.cardId !== undefined &&
              bill.dueDate >= snap.monthStart &&
              bill.dueDate <= snap.monthEnd,
          )
          .map((bill) => ({
            price: bill.expectedAmount ?? 0,
            currency: bill.currency ?? 'ARS',
          })),
        'ARS',
      ),
    )
    // One cuota each, not the whole purchase: the month consumed the
    // part of it that it is paying for.
    const bought = cents(
      sumIn(
        snap.purchases.map((purchase) => ({
          price: cuotaInMonth(purchase, snap.monthStart),
          currency: purchase.currency,
        })),
        'ARS',
      ),
    )

    expect(ring, key).toBe(
      cents(home.paid) - onTheCard + cents(home.owed) - resumenesDue + bought,
    )
  })

  // And a month where something really was bought on a card, so the
  // equation above is not three zeroes agreeing with each other.
  it('counts what went on a card where it was bought', () => {
    const found = [...snapshots.values()].flatMap((snap) =>
      snap.purchases
        .filter((purchase) => purchase.currency === 'ARS' && purchase.total > 0)
        .map((purchase) => ({ snap, purchase })),
    )
    // Not a vacuous pass: some seeded month really did buy on a card.
    expect(found.length).toBeGreaterThan(0)

    for (const { snap, purchase } of found) {
      const cuota = cuotaInMonth(purchase, snap.monthStart)
      // A purchase whose cuotas all land in other months puts nothing
      // into this one.
      if (cuota === 0) continue
      const slice = homeFigures(snap).byCategory.find(
        (row) => row.categoryId === purchase.categoryId,
      )
      // Its own category, not the card's.
      expect(cardCategoryIds(snap).has(purchase.categoryId)).toBe(false)
      expect(cents(slice?.total ?? 0)).toBeGreaterThanOrEqual(cents(cuota))
    }
  })

  // Her own case, and the reason this rule changed: a peluquería of
  // $609.100 paid in three cuotas was counting whole in the month it was
  // bought, so the category blew past a cap the household had spread the
  // purchase precisely in order to respect. One cuota per month, three
  // months running.
  it('spreads a purchase in cuotas over the months that pay it', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [model] = base.purchases.filter(
      (purchase) => (purchase.currency ?? 'ARS') === 'ARS',
    )
    if (model === undefined) throw new Error('no peso purchase to model on')

    const bought = new Date(
      base.monthStart.getFullYear(),
      base.monthStart.getMonth(),
      9,
    )
    const peluqueria: CardPurchase = {
      ...model,
      id: `${model.id}-peluqueria`,
      name: 'Peluquería',
      total: 609_100,
      cuotas: 3,
      purchaseDate: bought,
      currency: 'ARS',
    }
    const slice = (snap: Snapshot): number =>
      cents(
        homeFigures({ ...snap, purchases: [peluqueria] }).byCategory.find(
          (row) => row.categoryId === peluqueria.categoryId,
        )?.total ?? 0,
      )
    const expensesOut = (snap: Snapshot): Snapshot => ({
      ...snap,
      expenses: [],
      pendientes: [],
    })

    const thisMonth = expensesOut(base)
    const next = expensesOut({
      ...base,
      monthStart: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth() + 1,
        1,
      ),
    })
    const third = expensesOut({
      ...base,
      monthStart: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth() + 3,
        1,
      ),
    })

    // A third in the month it was bought, a third in the next -- not the
    // whole of it in either.
    expect(slice(thisMonth)).toBe(20_303_333)
    expect(slice(next)).toBe(20_303_333)
    // And nothing at all once the cuotas have run out.
    expect(slice(third)).toBe(0)
  })

  // Paying the card is not a thing the month spent money on: last
  // month's café is inside that figure, and last month's café already had
  // its slice, in the month it was drunk. So the bill leaves the ring and
  // is said under it -- in both currencies, which a peso ring could never
  // do. Her own case: she writes the statement by hand as a bill in the
  // card's category, and it was taking 43% of the month.
  it('says the card bill under the ring instead of drawing it in', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const card = [...cardCategoryIds(base)][0]
    if (card === undefined) throw new Error('no card category')
    const [model] = base.pendientes.filter((bill) => bill.cardId === undefined)
    if (model === undefined) throw new Error('no plain bill to model on')

    const written: Pendiente = {
      ...model,
      id: `${model.id}-resumen-a-mano`,
      name: 'Tarjeta de crédito octubre',
      categoryId: card,
      cardId: undefined,
      status: 'pending',
      expectedAmount: 2_584_074.64,
      currency: 'ARS',
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth(),
        11,
      ),
    }
    const snap: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, written],
    }
    const home = homeFigures(snap)
    const before = homeFigures(base)

    // Not a slice, and not a peso of the ring.
    const ring = (figures: typeof home): number =>
      figures.byCategory.reduce((sum, row) => sum + cents(row.total), 0)
    expect(ring(home)).toBe(ring(before))
    expect(
      home.byCategory.find((row) => row.categoryId === card)?.total ?? 0,
    ).toBe(0)

    // Said beside it instead, in its own currency.
    const pesos = home.cardBills.find((one) => one.currency === 'ARS')
    expect(cents(pesos?.total ?? 0)).toBe(
      cents(
        (before.cardBills.find((one) => one.currency === 'ARS')?.total ?? 0) +
          2_584_074.64,
      ),
    )
  })

  // Her own: paging Inicio back to a month whose bills were all paid
  // showed next month's, labelled "ya venció este mes" against a month
  // they do not belong to. Inicio's list was every pending bill the
  // household had, of any month, judged against whatever month was on
  // screen.
  it('lists the bills of the month on screen, not of every month', () => {
    const base = snapshots.get('completa·el mes pasado')
    if (base === undefined) throw new Error('missing snapshot')
    const home = homeFigures(base)
    for (const bill of home.bills) {
      const carried = home.late.some((other) => other.id === bill.id)
      expect(
        carried ||
          (bill.dueDate >= base.monthStart && bill.dueDate <= base.monthEnd),
        bill.name,
      ).toBe(true)
    }
    // And a month that has closed carries nothing in: that only happens
    // on the month that is running.
    expect(home.late).toEqual([])
  })

  // "Por pagar" is a lie on a bill the Visa pays: nobody is going to pay
  // it out of pocket. Her own, on Edenor.
  it('says who pays a bill the card is debited for', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const visa = base.cards.find((card) => card.kind === 'credito')
    if (visa === undefined) throw new Error('the seed has no credit card')
    const [model] = base.pendientes.filter(
      (bill) =>
        bill.cardId === undefined &&
        bill.status === 'pending' &&
        bill.dueDate >= base.monthStart &&
        bill.dueDate <= base.monthEnd,
    )
    if (model === undefined) throw new Error('no pending bill this month')

    const read = (bill: Pendiente): Movement | undefined =>
      categoryMovements({
        ...base,
        pendientes: [bill],
        expenses: [],
        purchases: [],
        categoryId: bill.categoryId,
      })[0]

    expect(read(model)?.kind).toBe('cuenta')
    expect(read({ ...model, paymentMethodId: visa.id })?.kind).toBe('tarjeta')
  })

  // Shares of a whole, so they come to a whole -- allowing for the one
  // cent that rounding thirteen categories can cost.
  each('the ring shares come to one', (snap, key) => {
    const rows = homeFigures(snap).byCategory.filter((row) => row.total > 0)
    if (rows.length === 0) return
    const share = rows.reduce((sum, row) => sum + row.share, 0)
    expect(Math.abs(share - 1), key).toBeLessThan(0.005)
  })

  // Every peso figure in the app leaves dollars out, because there is no
  // rate the app is willing to invent. This is that rule, checked on the
  // figures rather than on the helper.
  each('no peso figure has a dollar inside it', (snap, key) => {
    const home = homeFigures(snap)
    const pesosOnly = sumIn(snap.expenses, 'ARS')
    expect(cents(home.paid), key).toBe(cents(pesosOnly))

    // A dollar bill due this month is shown, and is not inside the peso
    // figure the budget is measured against.
    const dollarOwed = sumIn(
      snap.pendientes
        .filter(
          (pendiente) =>
            pendiente.status === 'pending' &&
            pendiente.dueDate >= snap.monthStart &&
            pendiente.dueDate <= snap.monthEnd,
        )
        .map((bill) => ({
          price: amountLeft(bill) ?? 0,
          currency: bill.currency ?? 'ARS',
        })),
      'USD',
    )
    if (dollarOwed > 0) {
      expect(cents(home.owed), key).toBeLessThan(
        cents(home.owed) + cents(dollarOwed),
      )
      expect(cents(home.owed), key).not.toBe(cents(home.owed + dollarOwed))
    }
    // Servicios' own figure counts only what is still unpaid, and only
    // in pesos.
    const servicios = serviciosFigures(snap)
    expect(cents(servicios.owed), key).toBe(
      cents(
        sumIn(
          servicios.unpaid.map((bill) => ({
            price: amountLeft(bill) ?? 0,
            currency: bill.currency ?? 'ARS',
          })),
          'ARS',
        ),
      ),
    )
  })

  // A bill the household already paid is in its own Expense. Counting it
  // here as well charged the month twice for it, which is how October read
  // two million short.
  each('nothing already paid is still owed', (snap, key) => {
    const home = homeFigures(snap)
    const paidBills = snap.pendientes.filter(
      (pendiente) => pendiente.status === 'paid',
    )
    const paidTotal = paidBills.reduce(
      (sum, bill) => sum + cents(bill.expectedAmount ?? 0),
      0,
    )
    if (paidTotal === 0) return
    const everything = snap.pendientes.reduce(
      (sum, bill) => sum + cents(bill.expectedAmount ?? 0),
      0,
    )
    expect(cents(home.owed), key).toBeLessThan(everything)
    for (const bill of home.bills) {
      expect(bill.status, `${key} · ${bill.name}`).toBe('pending')
    }
  })

  // A bill falls due in one month and counts against that month only.
  each('only this month’s bills count against this month', (snap, key) => {
    const home = homeFigures(snap)
    const inMonth = snap.pendientes.filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.dueDate >= snap.monthStart &&
        pendiente.dueDate <= snap.monthEnd,
    )
    expect(cents(home.owed), key).toBe(
      cents(
        sumIn(
          inMonth.map((bill) => ({
            price: amountLeft(bill) ?? 0,
            currency: bill.currency ?? 'ARS',
          })),
          'ARS',
        ),
      ),
    )
  })

  // Both now count the same month. Servicios can still be the larger of
  // the two, by whatever it carried in from an earlier one and by its
  // dollars, which Inicio's peso figure leaves out -- but never smaller.
  each('Servicios is never smaller than what Inicio counts', (snap, key) => {
    const home = homeFigures(snap)
    const servicios = serviciosFigures(snap)
    expect(
      cents(servicios.owed) + cents(servicios.owedUsd),
      key,
    ).toBeGreaterThanOrEqual(cents(home.owed))
  })

  // Inicio's "Pendiente" and Servicios' "Falta pagar" are not the same
  // figure, and the difference is exactly two things: Inicio counts a card
  // statement that arrived and falls due this month (Servicios leaves
  // every Resumen to Tarjetas), and Servicios counts what was carried in
  // from an earlier month (Inicio charges each month only its own).
  //
  // No seeded household has either, so both are built here. Written as an
  // equation so that if either screen ever starts counting something
  // else, this fails rather than the two quietly drifting apart.
  it('the two “owed” figures differ by exactly what they say', () => {
    const base = snapshots.get('completa·este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [model] = base.pendientes.filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.cardId === undefined &&
        (pendiente.currency ?? 'ARS') === 'ARS' &&
        pendiente.expectedAmount !== null,
    )
    if (model === undefined) throw new Error('no peso bill to model on')

    // A statement that arrived: a Resumen with a figure on it, due this
    // month, unpaid.
    const statement: Pendiente = {
      ...model,
      id: `${model.id}-resumen`,
      name: 'Visa',
      cardId: 'card-visa',
      expectedAmount: 91_000,
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth(),
        12,
      ),
    }
    // And a bill nobody paid two months ago, still owed.
    const stale: Pendiente = {
      ...model,
      id: `${model.id}-vieja`,
      name: 'Gas de septiembre',
      expectedAmount: 17_500,
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth() - 2,
        8,
      ),
    }
    const snap: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, statement, stale],
    }
    const home = homeFigures(snap)
    const servicios = serviciosFigures(snap)

    // The two differ by the statement alone now: Inicio counts a Resumen
    // with its real figure on it, which Servicios leaves to the cards,
    // and the arrears are counted by both.
    expect(cents(home.owed)).toBe(cents(servicios.owed) + cents(91_000))
    // Each screen's own list says the same thing the figures do.
    expect(servicios.unpaid.map((bill) => bill.id)).not.toContain(statement.id)
    expect(servicios.late.map((bill) => bill.id)).toContain(stale.id)
  })

  // The bar can fill the card but never more than it.
  each('the two bar segments never exceed the bar', (snap, key) => {
    const home = homeFigures(snap)
    expect(home.pctSpent + home.pctOwed, key).toBeLessThanOrEqual(100)
    expect(home.pctSpent, key).toBeGreaterThanOrEqual(0)
    expect(home.pctOwed, key).toBeGreaterThanOrEqual(0)
  })

  // Categorías divides up a month into bars; Inicio divides up the same
  // month into a ring. Category by category, they have to be the same
  // month: the bars counted only what had been paid, so a category whose
  // bill was still open read as far under its cap until the day somebody
  // paid it.
  each('Categorías and Inicio agree category by category', (snap, key) => {
    const home = homeFigures(snap)
    const bars = categoriasFigures(snap)
    const byId = new Map(bars.map((row) => [row.categoryId, row]))
    for (const slice of home.byCategory) {
      const bar = byId.get(slice.categoryId)
      if (bar === undefined) continue
      expect(cents(bar.total), `${key} · ${slice.name}`).toBe(
        cents(slice.total),
      )
    }
    // And a category over its cap is over it by the same arithmetic.
    for (const bar of bars) {
      if (bar.cap <= 0) continue
      expect(bar.over, `${key} · ${bar.name}`).toBe(
        cents(bar.total) > cents(bar.cap),
      )
    }
  })

  // The daily allowance is what is left divided by the days left, so
  // spending it every remaining day must never come to more than there
  // is. A figure that rounded up would promise a day the month cannot pay
  // for.
  each('the daily allowance fits in what is left', (snap, key) => {
    const home = homeFigures(snap)
    expect(home.perDay * home.daysLeft, key).toBeLessThanOrEqual(
      Math.max(0, home.left),
    )
  })

  // Two different months of card money, and no Resumen may be in both:
  // "con la tarjeta" is what the cards will ask next month, and what they
  // asked this month is already inside what the month owes.
  each('next month’s cards are not inside this month', (snap, key) => {
    const home = homeFigures(snap)
    const nextMonth = new Date(
      snap.monthStart.getFullYear(),
      snap.monthStart.getMonth() + 1,
      1,
    )
    const counted = snap.pendientes.filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.dueDate >= snap.monthStart &&
        pendiente.dueDate <= snap.monthEnd,
    )
    for (const bill of counted) {
      expect(bill.dueDate.getTime(), key).toBeLessThan(nextMonth.getTime())
    }
    // And the figure itself is only ever about Resúmenes.
    expect(
      home.cards.every((total) => total.total !== 0),
      key,
    ).toBe(true)
  })

  // A month that has ended has no days left to spread anything over, and
  // must not offer a daily allowance for days that are gone.
  each('a month already over offers nothing per day', (snap, key) => {
    const home = homeFigures(snap)
    if (!home.closed) return
    expect(home.daysLeft, key).toBe(0)
    expect(home.perDay, key).toBe(0)
  })

  // The comparison is against the same stretch of the month before. For a
  // month still running that is today; for one already over it is the
  // whole of it, and anchoring on today instead showed every month the
  // current one's figure.
  each('the comparison is cut at the right day', (snap, key) => {
    const home = homeFigures(snap)
    const cut = home.toDate.comparedThrough
    const expected = home.closed ? snap.monthEnd : snap.now
    expect(cut.getMonth(), key).toBe(
      new Date(expected.getFullYear(), expected.getMonth() - 1, 1).getMonth(),
    )
    expect(cents(home.toDate.difference), key).toBe(
      cents(home.toDate.thisMonth) - cents(home.toDate.lastMonth),
    )
  })

  // Worked in cents precisely so this holds: a purchase split six ways is
  // still the same purchase.
  each('a purchase in cuotas adds back up to itself', (snap, key) => {
    for (const purchase of snap.purchases) {
      const parts = cuotasOf(purchase)
      expect(parts.length, `${key} · ${purchase.name}`).toBe(purchase.cuotas)
      const sum = parts.reduce((total, part) => total + cents(part.amount), 0)
      expect(sum, `${key} · ${purchase.name}`).toBe(cents(purchase.total))
    }
  })

  // "Con la tarjeta" is read off the Resúmenes, one figure per currency,
  // and must never be two currencies added together.
  each('the card figure keeps its currencies apart', (snap, key) => {
    const home = homeFigures(snap)
    const seen = new Set(home.cards.map((total) => total.currency))
    expect(seen.size, key).toBe(home.cards.length)
    for (const total of home.cards) {
      expect(total.total, `${key} · ${total.currency}`).not.toBe(0)
    }
    const next = new Date(
      snap.monthStart.getFullYear(),
      snap.monthStart.getMonth() + 1,
      1,
    )
    const resumenes = snap.pendientes.filter(
      (pendiente) =>
        pendiente.cardId !== undefined &&
        pendiente.status === 'pending' &&
        pendiente.dueDate.getFullYear() === next.getFullYear() &&
        pendiente.dueDate.getMonth() === next.getMonth(),
    )
    for (const total of home.cards) {
      const mine = resumenes.filter(
        (resumen) => (resumen.currency ?? 'ARS') === total.currency,
      )
      expect(cents(total.total), `${key} · ${total.currency}`).toBe(
        mine.reduce(
          (sum, resumen) => sum + cents(resumen.estimatedAmount ?? 0),
          0,
        ),
      )
    }
  })

  // The figure on a card's Resumen and the list of consumos it opens into
  // are the same thing said twice. If they can drift, one of them is
  // wrong and the household has no way to tell which.
  each('a Resumen equals the cuotas behind it', (snap, key) => {
    for (const resumen of snap.pendientes) {
      if (resumen.cardId === undefined) continue
      const behind = snap.resumenCuotas.get(resumen.id)
      if (behind === undefined) continue
      expect(
        cents(resumen.estimatedAmount ?? 0),
        `${key} · ${resumen.name}`,
      ).toBe(behind)
    }
  })

  // On the month that is running, "lo que lleva gastado" and "Pagado" are
  // the same money counted two ways -- one up to today, one over the whole
  // month. They can only differ if something is dated in the future.
  each('the running month agrees with itself', (snap, key) => {
    const home = homeFigures(snap)
    if (home.closed) return
    const future = snap.expenses.filter(
      (expense) => expense.expenseDate > snap.now,
    )
    if (future.length > 0) return
    expect(cents(home.toDate.thisMonth), key).toBe(cents(home.paid))
  })

  // The projection's figure is what its own rows come to, and a row the
  // household switched off counts for nothing.
  each('the projection equals the rows it lists', (snap, key) => {
    const projection = projectionFigures(snap)
    expect(cents(projection.total), key).toBe(
      projection.rows.reduce((sum, row) => sum + cents(row.amount), 0),
    )
    for (const row of projection.rows) {
      if (row.excluded) {
        expect(row.amount, `${key} · ${row.label}`).toBe(0)
        expect(row.amountUsd, `${key} · ${row.label} · USD`).toBe(0)
      }
    }
  })

  // The dollars of the month ahead: their own figure, made of the same
  // rows, and never folded into the peso one.
  each('the projection keeps its dollars apart', (snap, key) => {
    const projection = projectionFigures(snap)
    expect(cents(projection.totalUsd), key).toBe(
      projection.rows.reduce((sum, row) => sum + cents(row.amountUsd), 0),
    )
  })

  // Biggest first wherever a list is read for what it says -- the ring
  // divides a month that has already happened, and the eye should land
  // on the slice that took the most.
  each('the ring is ordered biggest first', (snap, key) => {
    const ring = homeFigures(snap).byCategory
    for (let index = 1; index < ring.length; index += 1) {
      expect(
        (ring[index - 1]?.total ?? 0) >= (ring[index]?.total ?? 0),
        `${key} · ring`,
      ).toBe(true)
    }
  })

  // The projection is the exception, and deliberately: it lists every
  // category the household has, most of them at zero, and it is a list
  // you come to looking for one of them. Alphabetical is how you find a
  // name; biggest-first is how you read a result. Per direct feedback.
  each('the projection is ordered by name', (snap, key) => {
    const rows = projectionFigures(snap).rows
    for (let index = 1; index < rows.length; index += 1) {
      expect(
        (rows[index - 1]?.label ?? '').localeCompare(
          rows[index]?.label ?? '',
          'es',
        ) <= 0,
        `${key} · proyección`,
      ).toBe(true)
    }
  })

  // What is late leads, because it is the only thing on the list that is
  // already a problem.
  each('what is late is listed first', (snap, key) => {
    const bills = serviciosFigures(snap).bills
    let seenCurrent = false
    for (const bill of bills) {
      const late = bill.dueDate < snap.monthStart
      if (!late) seenCurrent = true
      else expect(seenCurrent, `${key} · ${bill.name}`).toBe(false)
    }
  })

  // A month with nothing in it is a real month, not an error: the figures
  // are zeroes and the screen says so.
  it('a month nothing was seeded into is all zeroes', () => {
    for (const [key, snap] of snapshots) {
      if (!key.endsWith('un mes sin nada')) continue
      const home = homeFigures(snap)
      expect(home.paid, key).toBe(0)
      expect(home.byCategory.length, key).toBe(0)
      expect(gastosFigures(snap).total, key).toBe(0)
    }
  })

  // A bill part-paid: the money that left is a Gasto of its own, and what
  // the month still owes is only the rest. The figure worth testing is
  // that the two add up to the bill and not to more than it -- counting
  // the whole figure as owed while the part-payment also sat in the
  // month's gastos would say the household spent it twice.
  it('counts only what a part-paid bill still owes', () => {
    const base = snapshots.get('completa\u00b7este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [model] = base.pendientes.filter(
      (pendiente) =>
        pendiente.cardId === undefined &&
        pendiente.status === 'pending' &&
        (pendiente.currency ?? 'ARS') === 'ARS' &&
        (pendiente.expectedAmount ?? 0) > 1000 &&
        pendiente.dueDate >= base.monthStart &&
        pendiente.dueDate <= base.monthEnd,
    )
    if (model === undefined)
      throw new Error('no pending peso bill of the month')
    const whole = model.expectedAmount ?? 0
    const handed = Math.round(whole / 4)

    const partly: Pendiente = {
      ...model,
      paidSoFar: handed,
      partialExpenseIds: ['gasto-del-pago-parcial'],
    }
    const paid: Expense = {
      id: 'gasto-del-pago-parcial',
      householdId: model.householdId,
      categoryId: model.categoryId,
      memberId: DEMO_USER_ID,
      authorDisplayName: 'Flor',
      name: model.name,
      price: handed,
      comments: '',
      expenseDate: base.now,
      pendienteId: model.id,
      isService: model.recurring,
      subcategory: null,
      currency: 'ARS',
      paymentMethodId: null,
      createdAt: base.now,
    }
    const snap: Snapshot = {
      ...base,
      pendientes: base.pendientes.map((one) =>
        one.id === model.id ? partly : one,
      ),
      expenses: [...base.expenses, paid],
      current: [...base.current, paid],
      allExpenses: [...base.allExpenses, paid],
    }

    const before = homeFigures(base)
    const home = homeFigures(snap)

    // What left the account is in what the month paid...
    expect(cents(home.paid)).toBe(cents(before.paid) + cents(handed))
    // ...and comes off what it still owes, peso for peso.
    expect(cents(home.owed)).toBe(cents(before.owed) - cents(handed))
    // So the category it is in says the same as it did: part of the bill
    // moved from owed to paid, and nothing about the month changed size.
    const totalOf = (figures: ReturnType<typeof categoriasFigures>): number =>
      figures.reduce((sum, row) => sum + cents(row.total), 0)
    expect(totalOf(categoriasFigures(snap))).toBe(
      totalOf(categoriasFigures(base)),
    )
    // And Servicios owes the rest, not the whole figure.
    expect(cents(serviciosFigures(snap).owed)).toBe(
      cents(serviciosFigures(base).owed) - cents(handed),
    )
  })

  // Lo de una vez is what Gastos is for. The gym is paid every month and
  // lives on Servicios; the café does not and lives here. Both are money
  // that left, so Inicio counts both -- which is the audit above, over
  // every seeded household. This one says it on one bill, plainly.
  it('keeps a servicio the month paid out of Gastos, but not out of Inicio', () => {
    const base = snapshots.get('completa\u00b7este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const servicio = base.expenses.find((expense) => isServicio(expense))
    if (servicio === undefined) throw new Error('no paid servicio seeded')

    const without: Snapshot = {
      ...base,
      expenses: base.expenses.filter((one) => one.id !== servicio.id),
    }

    // Gastos never counted it...
    expect(cents(gastosFigures(base).total)).toBe(
      cents(gastosFigures(without).total),
    )
    expect(cents(gastosFigures(base).total)).toBeGreaterThan(0)
    // ...and Inicio counts nothing else.
    expect(cents(homeFigures(base).paid)).toBe(
      cents(homeFigures(without).paid) + cents(servicio.price),
    )
  })

  // Inicio's "Servicios" column is the Servicios screen under a shorter
  // heading, so it has to be the same list in the same order -- it used
  // to sort the whole lot by due date, which mixed the settled ones back
  // in among the open ones and cost the column rows it had to spare.
  each(
    'Inicio lists the servicios in the order Servicios does',
    (snap, key) => {
      const home = homeFigures(snap)
      const servicios = serviciosFigures(snap)
      expect(
        home.bills.map((bill) => bill.id),
        key,
      ).toEqual(servicios.bills.map((bill) => bill.id))
    },
  )

  // A ceiling per currency, counted apart. A category spent in dollars
  // measured against a peso ceiling reads "$ 0 de $ 1.000.000" while the
  // money is plainly gone -- and converting the two into one figure is
  // refused everywhere else in this app, for the reason the rate moves
  // every day. Per direct feedback: "la categoría puede tener su tope en
  // dólares".
  it('measures each currency against its own ceiling', () => {
    const base = snapshots.get('completa\u00b7este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const withUsd = categoriasFigures(base).find((row) => row.totalUsd > 0)
    if (withUsd === undefined) throw new Error('no category spent in dollars')

    // A peso ceiling says nothing about the dollars...
    const pesosOnly = categoriasFigures({
      ...base,
      categories: base.categories.map((category) =>
        category.id === withUsd.categoryId
          ? { ...category, monthlyBudget: 10_000_000 }
          : category,
      ),
    }).find((row) => row.categoryId === withUsd.categoryId)
    expect(pesosOnly?.over).toBe(false)
    expect(pesosOnly?.capUsd).toBe(0)
    expect(pesosOnly?.overUsd).toBe(false)

    // ...and a dollar ceiling is what the dollars are held to.
    const capped = categoriasFigures({
      ...base,
      categories: base.categories.map((category) =>
        category.id === withUsd.categoryId
          ? {
              ...category,
              monthlyBudget: 10_000_000,
              monthlyBudgetUsd: withUsd.totalUsd - 1,
            }
          : category,
      ),
    }).find((row) => row.categoryId === withUsd.categoryId)
    expect(capped?.overUsd).toBe(true)
    // The peso side is untouched by it: the two are never added.
    expect(capped?.over).toBe(false)
    expect(capped?.total).toBe(withUsd.total)
  })

  // What the card asks of the month does not change because somebody
  // marked it paid. It used to: the line counted only the unpaid ones,
  // so paying the dollar side made the dollars vanish from it, as if the
  // month had never owed them. Per direct feedback: "es informativo".
  //
  // Built rather than seeded: Flor writes the card's real bill down as a
  // servicio of her own under the card's category when she goes to pay
  // it, which no demo household does.
  it('says what the card asked of the month, paid or not', () => {
    const base = snapshots.get('completa\u00b7este mes')
    if (base === undefined) throw new Error('missing snapshot')
    const [cardCategory] = [...cardCategoryIds(base)]
    if (cardCategory === undefined) throw new Error('no card category')
    const model = base.pendientes[0]
    if (model === undefined) throw new Error('no bill to model on')

    const byHand: Pendiente = {
      ...model,
      id: 'tarjeta-a-mano',
      name: 'Visa de noviembre',
      categoryId: cardCategory,
      cardId: undefined,
      purchaseIds: undefined,
      estimatedAmount: undefined,
      expectedAmount: 2_584_074.64,
      currency: 'ARS',
      status: 'pending',
      paidExpenseId: null,
      paidAt: null,
      dueDate: new Date(
        base.monthStart.getFullYear(),
        base.monthStart.getMonth(),
        12,
      ),
    }
    const owing: Snapshot = {
      ...base,
      pendientes: [...base.pendientes, byHand],
    }
    const settled: Snapshot = {
      ...base,
      settled: [
        ...base.settled,
        { ...byHand, status: 'paid' as const, paidAt: base.now },
      ],
    }

    // It is on the line while it is owed...
    expect(
      cents(
        homeFigures(owing).cardBills.find((one) => one.currency === 'ARS')
          ?.total ?? 0,
      ),
    ).toBe(
      cents(
        homeFigures(base).cardBills.find((one) => one.currency === 'ARS')
          ?.total ?? 0,
      ) + cents(2_584_074.64),
    )
    // ...and still on it once it is paid.
    expect(homeFigures(settled).cardBills).toEqual(homeFigures(owing).cardBills)
  })
})

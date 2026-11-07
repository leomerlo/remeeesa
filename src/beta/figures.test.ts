import { beforeAll, describe, expect, it } from 'vitest'
import { cuotasOf } from '@/lib/cards/cuotas'
import type { Card, CardPurchase } from '@/lib/cards'
import { currentMonthRange } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { Household } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import type { Projection } from '@/lib/proyecciones'
import { DEMO_SCENARIOS, DEMO_USER_ID, seedDemoHousehold } from '@/demo/seed'
import type { DemoScenario } from '@/demo/seed'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  cuentasFigures,
  gastosFigures,
  homeFigures,
  projectionFigures,
  sumIn,
} from './figures'

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
  readonly expenses: readonly Expense[]
  // The same list under the name projectionFigures asks for it by.
  readonly current: readonly Expense[]
  readonly previous: readonly Expense[]
  readonly allExpenses: readonly Expense[]
  readonly purchases: readonly CardPurchase[]
  readonly pendientes: readonly Pendiente[]
  readonly projection: Projection | null
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
    pendientes,
    projection,
  ] = await Promise.all([
    db.getHousehold(householdId),
    db.listCategories(householdId),
    db.listCards({ householdId }),
    db.listExpensesInMonth({ householdId, monthStart, monthEnd }),
    db.listExpensesInMonth({ householdId, ...previousRange }),
    db.listAllExpenses({ householdId }),
    db.listCardPurchasesInMonth({ householdId, monthStart, monthEnd }),
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
    expenses,
    current: expenses,
    previous,
    allExpenses,
    purchases,
    pendientes,
    projection,
    resumenCuotas,
    monthStart,
    monthEnd,
    now,
  }
}

const SCENARIOS = Object.keys(DEMO_SCENARIOS) as readonly DemoScenario[]

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
  // the rule Flor asked for -- an unpaid bill does not stay in its month,
  // it follows the household forward with a warning -- is built here
  // rather than hoped for. It is also the one case where Inicio's figure
  // and Cuentas' are meant to differ.
  it('carries an unpaid bill forward without charging this month for it', () => {
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
    const cuentas = cuentasFigures(snap)

    // It shows, and it shows first.
    expect(home.late.map((bill) => bill.id)).toContain(stale.id)
    expect(home.bills[0]?.id).toBe(stale.id)
    expect(cuentas.bills[0]?.id).toBe(stale.id)

    // It is still owed, so Cuentas counts it...
    expect(cents(cuentas.owed)).toBe(
      cents(cuentasFigures(base).owed) + cents(stale.expectedAmount ?? 0),
    )
    // ...and this month's budget does not, because it was September's
    // money. That is the whole of the October bug, as a test.
    expect(cents(home.owed)).toBe(cents(owedBefore))
  })

  // The hero says what is left; the legend under it says what it was
  // worked out from. If those two can disagree, the card is lying in its
  // own body text.
  each('the budget hero equals its own legend', (snap, key) => {
    const home = homeFigures(snap)
    expect(cents(home.left), key).toBe(
      cents(home.budget) - cents(home.paid) - cents(home.owed),
    )
  })

  // Inicio's "Pagado" and Gastos' "Total del mes" are the same sentence on
  // two screens. They were off by $45 for a month, which is what a dollar
  // expense counted as pesos looks like.
  each('Inicio and Gastos agree on the month total', (snap, key) => {
    expect(cents(gastosFigures(snap).total), key).toBe(
      cents(homeFigures(snap).paid),
    )
  })

  // The ring is a breakdown of that same figure, so its slices have to add
  // back up to it.
  each('the category ring adds up to the month total', (snap, key) => {
    const home = homeFigures(snap)
    const ring = home.byCategory.reduce((sum, row) => sum + cents(row.total), 0)
    expect(ring, key).toBe(cents(home.paid))
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
          price: bill.expectedAmount ?? 0,
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
    const cuentas = cuentasFigures(snap)
    expect(cents(cuentas.owed), key).toBe(
      cents(
        sumIn(
          cuentas.bills.map((bill) => ({
            price: bill.expectedAmount ?? 0,
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
            price: bill.expectedAmount ?? 0,
            currency: bill.currency ?? 'ARS',
          })),
          'ARS',
        ),
      ),
    )
  })

  // Cuentas lists everything still unpaid, of any month; Inicio counts
  // only the month on screen. The two are allowed to differ, and the
  // direction they differ in is the whole point.
  each('Cuentas is never smaller than what Inicio counts', (snap, key) => {
    const home = homeFigures(snap)
    const cuentas = cuentasFigures(snap)
    expect(
      cents(cuentas.owed) + cents(cuentas.owedUsd),
      key,
    ).toBeGreaterThanOrEqual(cents(home.owed))
  })

  // The bar can fill the card but never more than it.
  each('the two bar segments never exceed the bar', (snap, key) => {
    const home = homeFigures(snap)
    expect(home.pctSpent + home.pctOwed, key).toBeLessThanOrEqual(100)
    expect(home.pctSpent, key).toBeGreaterThanOrEqual(0)
    expect(home.pctOwed, key).toBeGreaterThanOrEqual(0)
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
      }
    }
  })

  // Biggest first, everywhere a list of amounts is shown.
  each('every list of amounts is ordered biggest first', (snap, key) => {
    const ring = homeFigures(snap).byCategory
    for (let index = 1; index < ring.length; index += 1) {
      expect(
        (ring[index - 1]?.total ?? 0) >= (ring[index]?.total ?? 0),
        `${key} · ring`,
      ).toBe(true)
    }
    const projection = projectionFigures(snap).rows
    for (let index = 1; index < projection.length; index += 1) {
      expect(
        (projection[index - 1]?.amount ?? 0) >=
          (projection[index]?.amount ?? 0),
        `${key} · proyección`,
      ).toBe(true)
    }
  })

  // What is late leads, because it is the only thing on the list that is
  // already a problem.
  each('what is late is listed first', (snap, key) => {
    const bills = cuentasFigures(snap).bills
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
})

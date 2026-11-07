import { cardsDueNextMonthTotals } from '@/lib/cards'
import type { CardsDueTotal } from '@/lib/cards'
import {
  buildProjection,
  computePendingCommitted,
  computeSpendToDate,
  computeSpentThisMonth,
  summarizeByCategory,
} from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { SpendToDate } from '@/lib/expenses'
import { monthlyBudgetFor } from '@/lib/households'
import type { Household } from '@/lib/households'
import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import { isBillToPay, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import type { Projection } from '@/lib/proyecciones'

// Every figure the beta puts on screen, worked out here and nowhere else.
//
// It lives apart from the screens for one reason: these are the numbers
// Flor and Leo read their month off, and a number computed inside a
// component can only be checked by rendering the component. Here each one
// is a function of its inputs, so figures.test.ts can take a real seeded
// household and assert the things that have to be true of it -- that the
// hero and its own legend agree, that Inicio and Gastos say the same total,
// that no peso figure anywhere has a dollar inside it.
//
// Nothing here invents arithmetic. Every rule is the v1's, called through
// the v1's own functions, because the beta redistributes how the month is
// shown and changes nothing about what it means.

export type Money = { readonly price: number; readonly currency: Currency }

// What a set of amounts comes to in one currency. Deliberately not
// computeSpentThisMonth, which answers the different question "what did
// this take out of the peso budget" and is right to drop everything else.
export function sumIn(items: readonly Money[], currency: Currency): number {
  const cents = items
    .filter((item) => item.currency === currency)
    .reduce((sum, item) => sum + Math.round(item.price * 100), 0)
  return cents / 100
}

export type HomeFigures = {
  // The month's budget, or 0 when the household has not set one.
  readonly budget: number
  // Money already gone: Expenses only, pesos only. The v1 calls it "En uso".
  readonly paid: number
  // Bills falling due inside this month that are still unpaid. Scoped to
  // the month because the v1 scopes it: a bill due in December does not eat
  // into October, and a paid one counts through its Expense instead.
  readonly owed: number
  // What the cards will ask for next month, one figure per currency, read
  // off the Resúmenes rather than re-added from purchases.
  readonly cards: readonly CardsDueTotal[]
  // budget - paid - owed. Negative means the month went over.
  readonly left: number
  readonly over: boolean
  // What the month has spent so far, for the no-budget hero, beside the
  // same stretch of the month before.
  readonly toDate: SpendToDate
  readonly spent: number
  // Whether the viewed month has already ended.
  readonly closed: boolean
  readonly daysLeft: number
  readonly perDay: number
  readonly pctSpent: number
  readonly pctOwed: number
  // Unpaid bills, soonest trouble first; and of those, the ones left over
  // from an earlier month.
  readonly bills: readonly Pendiente[]
  readonly late: readonly Pendiente[]
  readonly byCategory: ReturnType<typeof summarizeByCategory>
}

export type HomeInput = {
  readonly household: Household
  readonly expenses: readonly Expense[]
  readonly allExpenses: readonly Expense[]
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly now: Date
}

export function homeFigures(input: HomeInput): HomeFigures {
  const { household, expenses, allExpenses, pendientes, monthStart, monthEnd } =
    input
  const now = input.now

  const paid = computeSpentThisMonth(expenses)
  const owed = computePendingCommitted(
    pendientesDueInMonth(pendientes, monthStart, monthEnd),
  )
  const cards = cardsDueNextMonthTotals(pendientes, monthStart)
  const budget = monthlyBudgetFor(household, monthStart, now)

  const unpaid = pendientes.filter(
    (pendiente) => pendiente.status === 'pending' && isBillToPay(pendiente),
  )
  const bills = sortBills(unpaid, monthStart, now)
  const late = bills.filter((bill) => bill.dueDate < monthStart)

  // A month already over is compared whole against the month before it; a
  // month still running is cut at today. Anchoring on `now` whatever month
  // was open made every month show the current one's comparison.
  const closed = now > monthEnd
  const toDate = computeSpendToDate(allExpenses, closed ? monthEnd : now)

  const left = round2(budget - paid - owed)
  const daysLeft = Math.max(
    0,
    Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000),
  )
  return {
    budget,
    paid,
    owed,
    cards,
    left,
    over: left < 0,
    toDate,
    spent: toDate.thisMonth,
    closed,
    daysLeft,
    perDay: left > 0 && daysLeft > 0 ? Math.floor(left / daysLeft) : 0,
    pctSpent: budget > 0 ? Math.min(100, Math.round((paid / budget) * 100)) : 0,
    pctOwed:
      budget > 0
        ? Math.max(
            0,
            Math.min(
              100 - Math.min(100, Math.round((paid / budget) * 100)),
              Math.round((owed / budget) * 100),
            ),
          )
        : 0,
    bills,
    late,
    byCategory: summarizeByCategory({
      expenses,
      categories: input.categories,
    }),
  }
}

export type BillState = 'late' | 'due' | 'open'

export function billState(
  bill: Pendiente,
  monthStart: Date,
  now: Date,
): BillState {
  if (bill.dueDate < monthStart) return 'late'
  return bill.dueDate < now ? 'due' : 'open'
}

const RANK: Record<BillState, number> = { late: 0, due: 1, open: 2 }

// What is already late first, then what is due, then the rest -- and
// within each, oldest first.
export function sortBills(
  bills: readonly Pendiente[],
  monthStart: Date,
  now: Date,
): readonly Pendiente[] {
  return [...bills].sort(
    (a, b) =>
      RANK[billState(a, monthStart, now)] -
        RANK[billState(b, monthStart, now)] ||
      a.dueDate.getTime() - b.dueDate.getTime(),
  )
}

export type GastosFigures = {
  readonly total: number
  readonly totalUsd: number
  readonly byCategory: ReturnType<typeof summarizeByCategory>
}

export function gastosFigures(input: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
}): GastosFigures {
  return {
    total: computeSpentThisMonth(input.expenses),
    totalUsd: sumIn(input.expenses, 'USD'),
    byCategory: summarizeByCategory(input),
  }
}

export type CuentasFigures = {
  // Everything still unpaid, of any month -- what the screen lists. Wider
  // than the Home's `owed`, which only counts the viewed month, and the two
  // are meant to differ: this answers "what do we still owe", that one
  // answers "what does this month's budget still have to cover".
  readonly bills: readonly Pendiente[]
  readonly owed: number
  readonly owedUsd: number
  // Bills carried over from an earlier month, which is why the two figures
  // above can be larger than the Home's.
  readonly late: readonly Pendiente[]
}

export function cuentasFigures(input: {
  readonly pendientes: readonly Pendiente[]
  readonly monthStart: Date
  readonly now: Date
}): CuentasFigures {
  const bills = sortBills(
    input.pendientes.filter(
      (pendiente) => pendiente.status === 'pending' && isBillToPay(pendiente),
    ),
    input.monthStart,
    input.now,
  )
  const amounts = bills.map((bill) => ({
    price: bill.expectedAmount ?? 0,
    currency: bill.currency ?? DEFAULT_CURRENCY,
  }))
  return {
    bills,
    owed: sumIn(amounts, DEFAULT_CURRENCY),
    owedUsd: sumIn(amounts, 'USD'),
    late: bills.filter((bill) => bill.dueDate < input.monthStart),
  }
}

// The bills of a month that were settled with a credit card. The money
// did not leave the household: it went onto the card and arrives in that
// card's Resumen, so it belongs beside the cards and not among what is
// still owed.
//
// This is the only link the database holds between a bill and a card.
// There is no field saying a bill *will* be charged to one, so it can only
// be known after it has been marked paid that way -- which is why this
// takes the month's already-paid bills rather than its pending ones.
export function billsOnCard(
  settled: readonly Pendiente[],
): readonly Pendiente[] {
  return settled.filter((bill) => (bill.paidPurchaseId ?? null) !== null)
}

// What those bills come to in pesos. Dollars are left out, like every
// other peso figure.
export function billsOnCardTotal(settled: readonly Pendiente[]): number {
  return sumIn(
    billsOnCard(settled).map((bill) => ({
      price: bill.expectedAmount ?? 0,
      currency: bill.currency ?? DEFAULT_CURRENCY,
    })),
    DEFAULT_CURRENCY,
  )
}

export type ProjectionKind = 'cargado' | 'anterior' | 'servicio'

export type ProjectionLine = {
  readonly key: string
  readonly label: string
  readonly kind: ProjectionKind
  readonly categoryId: string
  readonly price: number
  // What the line counts as once the household's own edits are applied:
  // the typed-over amount, or 0 when the row is switched off.
  readonly amount: number
  readonly excluded: boolean
}

export type ProjectionFigures = {
  readonly rows: readonly ProjectionLine[]
  readonly total: number
  readonly edited: boolean
}

export function projectionFigures(input: {
  readonly current: readonly Expense[]
  readonly previous: readonly Expense[]
  readonly pendientes: readonly Pendiente[]
  readonly projection: Projection | null
  readonly monthStart: Date
  readonly monthEnd: Date
}): ProjectionFigures {
  // Through countedByBudget like every other peso figure: a card billed in
  // dollars is due this month too, and adding it in would make the total a
  // number of nothing.
  const servicios = countedByBudget(
    pendientesDueInMonth(
      input.pendientes,
      input.monthStart,
      input.monthEnd,
    ).map((pendiente) => ({
      ...pendiente,
      currency: pendiente.currency ?? DEFAULT_CURRENCY,
    })),
  )
  const monthKey = (key: string): string =>
    `${String(input.monthStart.getTime())}-${key}`
  const excluded = new Set(input.projection?.excluded ?? [])
  const overrides = input.projection?.overrides ?? {}
  const amountOf = (key: string, price: number): number => {
    const raw = overrides[monthKey(key)]
    if (raw === undefined) return price
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }

  const rows = [
    ...buildProjection(
      input.previous,
      input.current,
      servicios.map((servicio) => servicio.name),
    ).map((row) => ({
      key: row.categoryId,
      label: '',
      kind:
        row.source === 'actual' ? ('cargado' as const) : ('anterior' as const),
      categoryId: row.categoryId,
      price: row.price,
    })),
    ...servicios.map((pendiente) => ({
      key: `servicio-${pendiente.id}`,
      label: pendiente.name,
      kind: 'servicio' as const,
      categoryId: pendiente.categoryId,
      price: pendiente.expectedAmount ?? 0,
    })),
  ]
    .map((row) => ({
      ...row,
      excluded: excluded.has(monthKey(row.key)),
      amount: excluded.has(monthKey(row.key))
        ? 0
        : amountOf(row.key, row.price),
    }))
    // Biggest first, like every other list of amounts in this app.
    .sort((a, b) => b.amount - a.amount || b.price - a.price)

  return {
    rows,
    total: round2(rows.reduce((sum, row) => sum + row.amount, 0)),
    edited: rows.some(
      (row) => row.excluded || overrides[monthKey(row.key)] !== undefined,
    ),
  }
}

// Figures that are about to be compared with each other must not each
// carry their own floating-point drift -- the same reason every total in
// @/lib is summed in cents.
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

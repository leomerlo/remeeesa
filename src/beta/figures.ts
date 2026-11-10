import { cardsDueNextMonthTotals, RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import type {
  Card as PaymentMethod,
  CardPurchase,
  CardsDueTotal,
} from '@/lib/cards'
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
import {
  countedByBudget,
  DEFAULT_CURRENCY,
  parseStoredAmount,
} from '@/lib/money'
import type { Currency } from '@/lib/money'
import { isBillToPay, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'

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

// The household's credit cards, by id. A bill the bank takes from one of
// these is not money leaving the month: it goes onto the card and arrives
// in that card's Resumen, next month.
export function creditMethodIds(
  methods: readonly PaymentMethod[],
): ReadonlySet<string> {
  return new Set(
    methods
      .filter((method) => method.kind === 'credito')
      .map((method) => method.id),
  )
}

// A bill that lands on a credit card rather than on the month.
//
// Two ways of knowing, and the second is the newer one: it was settled
// with a card, which wrote a consumo; or it says so itself, because
// somebody put a credit card in its "¿con qué se paga?". The second is
// what makes a débito automático on the Visa read as a card expense from
// the moment it is set up, instead of only once the bank has taken it --
// which is a month of it sitting among what this month has to pay out of
// the budget, which it never will.
export function onCreditCard(
  bill: Pendiente,
  credit: ReadonlySet<string>,
): boolean {
  if ((bill.paidPurchaseId ?? null) !== null) return true
  return bill.paymentMethodId != null && credit.has(bill.paymentMethodId)
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
  // Bought on a credit card this month: not money out yet, and still what
  // the month spent on what it bought.
  readonly purchases: readonly CardPurchase[]
  readonly allExpenses: readonly Expense[]
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
  // Every way the household pays, which is what says whether a bill comes
  // out of this month or goes onto a card.
  readonly methods: readonly PaymentMethod[]
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly now: Date
}

export function homeFigures(input: HomeInput): HomeFigures {
  const { household, expenses, allExpenses, pendientes, monthStart, monthEnd } =
    input
  const now = input.now

  const paid = computeSpentThisMonth(expenses)
  // The month's own bills, still owed. One list, read twice: once as the
  // figure beside "Pagado", and once as part of the breakdown under it --
  // the two were reading different lists, so the ring under the hero
  // divided up a smaller month than the hero itself counted.
  //
  // Minus whatever the bank takes from a credit card: that money does not
  // leave this month, it becomes a consumo in that card's Resumen. Those
  // bills live beside the cards, on Servicios' "Con tarjeta" side.
  const credit = creditMethodIds(input.methods)
  const dueThisMonth = pendientesDueInMonth(
    pendientes,
    monthStart,
    monthEnd,
  ).filter((bill) => !onCreditCard(bill, credit))
  const owed = computePendingCommitted(dueThisMonth)
  const cards = cardsDueNextMonthTotals(pendientes, monthStart)
  const budget = monthlyBudgetFor(household, monthStart, now)

  const unpaid = pendientes.filter(
    (pendiente) =>
      pendiente.status === 'pending' &&
      isBillToPay(pendiente) &&
      !onCreditCard(pendiente, credit),
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
    // What the month consumed, which is not the same list the hero adds
    // up -- see monthByCategory.
    byCategory: monthByCategory({
      expenses,
      purchases: input.purchases,
      pendientes,
      categories: input.categories,
      methods: input.methods,
      monthStart,
      monthEnd,
    }),
  }
}

export type BillState = 'paid' | 'late' | 'due' | 'open'

// Settled first, because a paid bill has no deadline left to be on the
// wrong side of. Then: carried in from an earlier month, past its date
// this month, or still ahead of it.
export function billState(
  bill: Pendiente,
  monthStart: Date,
  now: Date,
): BillState {
  if (bill.status === 'paid') return 'paid'
  if (bill.dueDate < monthStart) return 'late'
  return bill.dueDate < now ? 'due' : 'open'
}

const RANK: Record<BillState, number> = { late: 0, due: 1, open: 2, paid: 3 }

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

// The categories a Resumen lives in -- the card's own, whatever it is
// called. Read off the bills themselves rather than looked up by name:
// the category is created as "Tarjeta", but a household can rename it and
// a rename changes nothing but the name. The name is kept as a second way
// in, for a household that has the category but no card bill pending.
export function cardCategoryIds(input: {
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
}): ReadonlySet<string> {
  const ids = new Set(
    input.pendientes
      .filter((pendiente) => pendiente.cardId !== undefined)
      .map((pendiente) => pendiente.categoryId),
  )
  const named = input.categories.find(
    (category) => category.name === RESUMEN_CATEGORY_NAME,
  )
  if (named !== undefined) ids.add(named.id)
  return ids
}

// What the month consumed, by category -- which is a different question
// from what left the household, and the one a breakdown by category is
// asked. The café was drunk this month whoever settles the card next
// month, so a consumo counts where it was bought and in the month it was
// bought.
//
// Three things, then: what was paid, what the month still owes, and what
// went on a card. And one thing left out -- paying a card's Resumen. Those
// gastos are last month's shopping arriving, already counted back when it
// was bought, and counting them again would put the card in twice.
export function monthByCategory(input: {
  readonly expenses: readonly Expense[]
  readonly purchases: readonly CardPurchase[]
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
  readonly monthStart: Date
  readonly monthEnd: Date
}): ReturnType<typeof summarizeByCategory> {
  const cards = cardCategoryIds(input)
  const credit = creditMethodIds(input.methods)
  return summarizeByCategory({
    expenses: input.expenses.filter(
      (expense) => !cards.has(expense.categoryId),
    ),
    categories: input.categories,
    // A Resumen is a card bill, and the card speaks through its consumos
    // here. Every other bill of the month counts: the luz is this month's
    // light whether or not anybody has paid it yet.
    pendientes: pendientesDueInMonth(
      input.pendientes,
      input.monthStart,
      input.monthEnd,
    ).filter(
      (pendiente) =>
        // A Resumen, and a bill the bank takes from a credit card: both
        // speak through the card's consumos instead. The second counts
        // here on the day the bank takes it, as the consumo it becomes.
        pendiente.cardId === undefined && !onCreditCard(pendiente, credit),
    ),
    purchases: input.purchases,
  })
}

// Categorías: every category the household has, with what the month put
// in it and the cap it set, if it set one.
//
// Here rather than in the screen for the reason the whole file exists:
// these are the bars Flor reads a category off, and the month they divide
// up has to be the same month Inicio's ring divides up -- the two were
// counting different things, because only one of them counted the bills.
export type CategoryRow = {
  readonly categoryId: string
  readonly name: string
  readonly color: string
  // 0 when the category has no cap, which is most of them.
  readonly cap: number
  readonly total: number
  readonly share: number
  readonly over: boolean
  // The card's own category. Its figure is always zero here on purpose:
  // what went on the card is counted in the category it was bought for,
  // and paying the Resumen is that same shopping arriving. The row stays
  // so the category can still be opened and edited.
  readonly isCard: boolean
}

export function categoriasFigures(input: {
  readonly expenses: readonly Expense[]
  readonly purchases: readonly CardPurchase[]
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
  readonly methods: readonly PaymentMethod[]
  readonly monthStart: Date
  readonly monthEnd: Date
}): readonly CategoryRow[] {
  const summary = monthByCategory(input)
  const cards = cardCategoryIds(input)
  const found = new Map(summary.map((row) => [row.categoryId, row]))
  return (
    input.categories
      .map((category) => {
        const total = found.get(category.id)?.total ?? 0
        return {
          categoryId: category.id,
          name: category.name,
          color: category.color,
          cap: category.monthlyBudget,
          total,
          share: found.get(category.id)?.share ?? 0,
          over: category.monthlyBudget > 0 && total > category.monthlyBudget,
          isCard: cards.has(category.id),
        }
      })
      // Most spent first, and then the untouched ones by name, so the
      // month still reads top to bottom.
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
  )
}

export type ServiciosFigures = {
  // The month's own bills, unpaid first and then the ones already
  // settled. Paging to October shows October's: what was owed then, what
  // was paid, and what fell due and never was.
  readonly bills: readonly Pendiente[]
  readonly unpaid: readonly Pendiente[]
  readonly paid: readonly Pendiente[]
  // Pesos still owed for this month.
  readonly owed: number
  readonly owedUsd: number
  // Bills carried in from an earlier month. Only ever present on the
  // month that is running: a bill left unpaid follows the household
  // forward, but it does not travel backwards into a month that had
  // already closed without it.
  readonly late: readonly Pendiente[]
  // The month's bills that go on a credit card rather than coming out of
  // the month -- the ones the bank already put there, and the ones that
  // say a credit card is what pays them. These are the whole of the "Con
  // tarjeta" side of the screen, and they are in none of the lists above:
  // a bill cannot both come out of this month and arrive in next month's
  // Resumen.
  readonly onCard: readonly Pendiente[]
  readonly onCardTotal: number
}

export function serviciosFigures(input: {
  // Every Pendiente the household has, of any month and any status.
  readonly pendientes: readonly Pendiente[]
  // The month's bills that have already been paid. Firestore keeps these
  // out of listPendientes' own result, so they are fetched separately.
  readonly settled: readonly Pendiente[]
  // Every way the household pays, which is what tells a bill that comes
  // out of this month from one that goes onto a card.
  readonly methods: readonly PaymentMethod[]
  readonly monthStart: Date
  readonly monthEnd: Date
  readonly now: Date
}): ServiciosFigures {
  const bill = (pendiente: Pendiente): boolean => isBillToPay(pendiente)
  const inMonth = (pendiente: Pendiente): boolean =>
    pendiente.dueDate >= input.monthStart && pendiente.dueDate <= input.monthEnd
  // What the card pays comes out of every list on the month's side and
  // goes into its own, whether or not the bank has taken it yet.
  const credit = creditMethodIds(input.methods)
  const card = (pendiente: Pendiente): boolean =>
    onCreditCard(pendiente, credit)

  // The month on screen is the month that is running when today falls
  // inside it. Only then does anything get carried forward.
  const current = input.now >= input.monthStart && input.now <= input.monthEnd
  const late = current
    ? input.pendientes.filter(
        (pendiente) =>
          bill(pendiente) &&
          pendiente.status === 'pending' &&
          pendiente.dueDate < input.monthStart &&
          !card(pendiente),
      )
    : []

  const unpaidThisMonth = input.pendientes.filter(
    (pendiente) =>
      bill(pendiente) &&
      pendiente.status === 'pending' &&
      inMonth(pendiente) &&
      !card(pendiente),
  )
  const paid = input.settled
    .filter(
      (pendiente) => bill(pendiente) && inMonth(pendiente) && !card(pendiente),
    )
    .slice()
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

  // Both sides of the same month: the ones the bank has already charged,
  // and the ones it is going to. Pending first, because those are the
  // ones still worth looking at.
  const onCardPending = input.pendientes.filter(
    (pendiente) =>
      bill(pendiente) &&
      pendiente.status === 'pending' &&
      (inMonth(pendiente) ||
        (current && pendiente.dueDate < input.monthStart)) &&
      card(pendiente),
  )
  const onCardPaid = input.settled.filter(
    (pendiente) => bill(pendiente) && inMonth(pendiente) && card(pendiente),
  )
  const onCard = [
    ...sortBills(onCardPending, input.monthStart, input.now),
    ...[...onCardPaid].sort(
      (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
    ),
  ]

  // What is already late leads, then what has fallen due, then what has
  // not yet -- and everything settled goes under all of it, because it
  // needs nothing from anybody.
  const unpaid = [
    ...sortBills(late, input.monthStart, input.now),
    ...sortBills(unpaidThisMonth, input.monthStart, input.now),
  ]
  const amounts = unpaid.map((pendiente) => ({
    price: pendiente.expectedAmount ?? 0,
    currency: pendiente.currency ?? DEFAULT_CURRENCY,
  }))

  return {
    bills: [...unpaid, ...paid],
    unpaid,
    paid,
    owed: sumIn(amounts, DEFAULT_CURRENCY),
    owedUsd: sumIn(amounts, 'USD'),
    late,
    onCard,
    onCardTotal: sumIn(
      onCard.map((one) => ({
        price: one.expectedAmount ?? 0,
        currency: one.currency ?? DEFAULT_CURRENCY,
      })),
      DEFAULT_CURRENCY,
    ),
  }
}

export type ProjectionKind =
  'cargado' | 'anterior' | 'servicio' | 'tarjeta' | 'vacio'

export type ProjectionLine = {
  readonly key: string
  readonly label: string
  readonly kind: ProjectionKind
  readonly categoryId: string
  readonly color: string
  readonly price: number
  // What the line counts as once the household's own edits are applied:
  // the typed-over amount, or 0 when the row is switched off.
  readonly amount: number
  readonly excluded: boolean
  // Typed over by hand, as opposed to read off the two months.
  readonly pinned: boolean
}

export type ProjectionFigures = {
  readonly rows: readonly ProjectionLine[]
  readonly total: number
  readonly edited: boolean
  // Nothing in either month and no bills: a column of zeroes would be a
  // list of everything the household could spend on and nothing it does.
  readonly empty: boolean
}

// The month ahead, as the screen draws it.
//
// All of it here rather than half here and half in the screen: it was
// both, and they had drifted -- this one still listed a card bill at $0
// and still carried the card's own category over on top of it, which is
// the double count the screen had already been fixed for. The audit was
// checking arithmetic nobody was looking at.
export function projectionFigures(input: {
  readonly current: readonly Expense[]
  readonly previous: readonly Expense[]
  readonly pendientes: readonly Pendiente[]
  readonly categories: readonly Category[]
  // Whatever edits are in force: what the household has saved, or what
  // it has typed since the screen loaded and not saved yet. Structural
  // rather than a Projection, so the screen can hand it the half of one
  // it is holding.
  readonly projection: {
    readonly excluded: readonly string[]
    readonly overrides: Readonly<Record<string, string>>
  } | null
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

  // Paying a card bill writes its gastos into the card's own category, so
  // carrying that category over from last month is a second guess at the
  // same money the card lines already carry -- the bill counted twice.
  //
  // Read off the bills themselves rather than looked up by name: the
  // category is created as "Tarjeta", but a household can rename it and a
  // rename changes nothing but the name. The name is kept as a second way
  // in, for a household that has the category but no card bill pending.
  const cardCategories = new Set(
    input.pendientes
      .filter((pendiente) => pendiente.cardId !== undefined)
      .map((pendiente) => pendiente.categoryId),
  )
  const named = input.categories.find(
    (category) => category.name === RESUMEN_CATEGORY_NAME,
  )
  if (named !== undefined) cardCategories.add(named.id)

  const byId = new Map(
    input.categories.map((category) => [category.id, category]),
  )
  const nameOf = (categoryId: string): string =>
    byId.get(categoryId)?.name ?? 'Sin categoría'
  const colorOf = (categoryId: string): string =>
    byId.get(categoryId)?.color ?? '#9aa0a6'

  type Seed = {
    readonly key: string
    readonly label: string
    readonly kind: ProjectionKind
    readonly categoryId: string
    readonly color: string
    readonly price: number
  }

  // What the two months say: a category spent in this one, or last one's
  // figure where this one has nothing yet.
  const carried: readonly Seed[] = buildProjection(
    input.previous,
    input.current,
    servicios.map((servicio) => servicio.name),
  )
    .filter((row) => !cardCategories.has(row.categoryId))
    .map((row) => ({
      key: row.categoryId,
      label: nameOf(row.categoryId),
      kind:
        row.source === 'actual' ? ('cargado' as const) : ('anterior' as const),
      categoryId: row.categoryId,
      color: colorOf(row.categoryId),
      price: row.price,
    }))

  // A card bill is the one line the app can fill in before it arrives: the
  // cuotas already bought that land in this month add up to a figure it
  // has been keeping all along. Still only an estimate -- next month's own
  // purchases are not in it -- so it is the line most worth typing over.
  const billed: readonly Seed[] = servicios.map((pendiente) => ({
    key: `servicio-${pendiente.id}`,
    label: pendiente.name,
    kind:
      pendiente.cardId === undefined
        ? ('servicio' as const)
        : ('tarjeta' as const),
    categoryId: pendiente.categoryId,
    color: colorOf(pendiente.categoryId),
    price:
      pendiente.expectedAmount ??
      (pendiente.cardId === undefined ? 0 : (pendiente.estimatedAmount ?? 0)),
  }))

  // And every other category the household has, at zero. Reading the two
  // months only ever yields the categories that had something in them,
  // and a projection is exactly where somebody wants to say "este mes sí
  // vamos a gastar en esto".
  const spoken = new Set(carried.map((row) => row.key))
  const quiet: readonly Seed[] = input.categories
    .filter(
      (category) =>
        !cardCategories.has(category.id) && !spoken.has(category.id),
    )
    .map((category) => ({
      key: category.id,
      label: category.name,
      kind: 'vacio' as const,
      categoryId: category.id,
      color: category.color,
      price: 0,
    }))

  const monthKey = (key: string): string =>
    `${String(input.monthStart.getTime())}-${key}`
  const excluded = new Set(input.projection?.excluded ?? [])
  const overrides = input.projection?.overrides ?? {}
  const amountOf = (key: string, price: number): number => {
    const raw = overrides[monthKey(key)]
    if (raw === undefined) return price
    // Plain as the field hands it over, or written as it was typed before
    // the field knew how to format itself -- parseStoredAmount takes both.
    return parseStoredAmount(raw)
  }

  const rows: readonly ProjectionLine[] = [...carried, ...billed, ...quiet]
    .map((row) => ({
      ...row,
      excluded: excluded.has(monthKey(row.key)),
      pinned: overrides[monthKey(row.key)] !== undefined,
      amount: excluded.has(monthKey(row.key))
        ? 0
        : amountOf(row.key, row.price),
    }))
    // By the figure the month suggests rather than by the one on screen:
    // sorting on what is typed would move a line out from under the
    // cursor halfway through typing it. The empty ones fall to the bottom
    // by themselves, and sort among each other by name.
    .slice()
    .sort((a, b) => b.price - a.price || a.label.localeCompare(b.label, 'es'))

  return {
    rows,
    total:
      rows.reduce((cents, row) => cents + Math.round(row.amount * 100), 0) /
      100,
    edited: rows.some((row) => row.excluded || row.pinned),
    empty: carried.length === 0 && billed.length === 0,
  }
}

// Figures that are about to be compared with each other must not each
// carry their own floating-point drift -- the same reason every total in
// @/lib is summed in cents.
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

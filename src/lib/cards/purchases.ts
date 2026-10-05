import { cardAccepts, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import type { Expense } from '@/lib/expenses/types'
import {
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
} from '@/lib/expenses/validate'
import { currentMonthRange } from '@/lib/expenses/remainingBudget'
import type { HouseholdsDb } from '@/lib/households/types'
import { pendientesDueInMonth } from '@/lib/pendientes/pendingForMonth'
import type { Pendiente } from '@/lib/pendientes/types'
import { cuotasOf } from './cuotas'
import type { Cuota } from './cuotas'
import type { CardPurchase } from './types'

export const MAX_CUOTAS = 24

// Every Resumen lives in this category, find-or-created on the first purchase.
export const RESUMEN_CATEGORY_NAME = 'Tarjeta'

// Resúmenes are due on this day of their month.
export const RESUMEN_DUE_DAY = 10

const monthFormatter = new Intl.DateTimeFormat('es-AR', {
  month: 'long',
  year: 'numeric',
})

export class ResumenAlreadyPaidError extends Error {
  override readonly name = 'ResumenAlreadyPaidError'

  constructor(cardName: string, monthStart: Date) {
    super(
      `El resumen de ${cardName} de ${monthFormatter.format(monthStart)} ya está pagado.`,
    )
  }
}

export class ResumenNotYetPayableError extends Error {
  override readonly name = 'ResumenNotYetPayableError'

  constructor(cardName: string, monthStart: Date) {
    super(
      `El resumen de ${cardName} de ${monthFormatter.format(monthStart)} no se puede pagar antes de que empiece el mes.`,
    )
  }
}

export const CARD_PURCHASE_LOCKED_MESSAGE =
  'Tiene cuotas en un resumen ya pagado: no se puede editar ni borrar.'

// Any of its cuotas is in a paid Resumen (CardPurchase.paidResumenIds).
export class CardPurchaseLockedError extends Error {
  override readonly name = 'CardPurchaseLockedError'

  constructor() {
    super(CARD_PURCHASE_LOCKED_MESSAGE)
  }
}

// The purchase's currency is not one the card holds -- the card was
// narrowed while the form was open on the other currency.
export class CardCurrencyNotAcceptedError extends Error {
  override readonly name = 'CardCurrencyNotAcceptedError'

  constructor(cardName: string) {
    super(`${cardName} no admite consumos en esa moneda.`)
  }
}

// A card with purchases or Resúmenes pointing at it. Deleting it would
// leave each of them with a card id that resolves to nothing -- a bill with
// no explanation of what it is for.
export class CardInUseError extends Error {
  override readonly name = 'CardInUseError'

  constructor(cardName: string) {
    super(
      `${cardName} tiene consumos o resúmenes cargados: no se puede borrar.`,
    )
  }
}

export class CardNotFoundError extends Error {
  override readonly name = 'CardNotFoundError'

  constructor() {
    super('No se encontró la tarjeta.')
  }
}

export class CardPurchaseNotFoundError extends Error {
  override readonly name = 'CardPurchaseNotFoundError'

  constructor() {
    super('No se encontró la compra.')
  }
}

// total is the purchase's already-parsed price: every cuota has to be at
// least one cent.
export function parseCuotas(cuotas: number, total: number): number {
  if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > MAX_CUOTAS) {
    throw new Error(
      `Las cuotas deben ser un número entero entre 1 y ${String(MAX_CUOTAS)}`,
    )
  }
  if (Math.round(total * 100) < cuotas) {
    throw new Error('El precio tiene que ser de al menos $0,01 por cuota')
  }
  return cuotas
}

export async function createCardPurchase(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly categoryId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly name: string
  readonly total: number
  readonly cuotas: number
  readonly purchaseDate: Date
  readonly comments: string
  // Pesos when omitted; must be one the card holds.
  readonly currency?: Currency
}): Promise<CardPurchase> {
  const name = parseExpenseName(input.name)
  const total = parseExpensePrice(input.total)
  const cuotas = parseCuotas(input.cuotas, total)
  const purchaseDate = parseExpenseDate(input.purchaseDate)
  const authorDisplayName = parseAuthorDisplayName(input.authorDisplayName)
  const currency = await assertCardAccepts(input.db, input)
  const resumenCategory = await input.db.findOrCreateCategory({
    householdId: input.householdId,
    name: RESUMEN_CATEGORY_NAME,
  })
  return input.db.createCardPurchase({
    householdId: input.householdId,
    cardId: input.cardId,
    categoryId: input.categoryId,
    resumenCategoryId: resumenCategory.id,
    memberId: input.memberId,
    authorDisplayName,
    name,
    total,
    cuotas,
    purchaseDate,
    comments: input.comments,
    currency,
  })
}

// Paying a bill with a credit card. What leaves the household is nothing,
// today: the bill goes onto the card and arrives in that card's Resumen,
// which is the month the money actually goes. So this books a CardPurchase
// and marks the bill paid through it -- no Expense anywhere, because none
// has happened. Per direct feedback: pagás la Luz con la Visa y eso sale el
// mes que viene, no hoy.
//
// Only credit does this. Cash, a balance and debit are money that has
// already gone, so they stay markPendientePaid, which records the method on
// the Expense it writes.
export async function markPendientePaidWithCard(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
  readonly cardId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly finalAmount: number
  readonly cuotas: number
  readonly paymentDate: Date
  readonly currency?: Currency
}): Promise<{
  readonly pendiente: Pendiente
  readonly purchase: CardPurchase
}> {
  const finalAmount = parseExpensePrice(input.finalAmount)
  const cuotas = parseCuotas(input.cuotas, finalAmount)
  const paymentDate = parseExpenseDate(input.paymentDate)
  const authorDisplayName = parseAuthorDisplayName(input.authorDisplayName)
  const currency = await assertCardAccepts(input.db, input)
  const resumenCategory = await input.db.findOrCreateCategory({
    householdId: input.householdId,
    name: RESUMEN_CATEGORY_NAME,
  })
  return input.db.markPendientePaidWithCard({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    cardId: input.cardId,
    resumenCategoryId: resumenCategory.id,
    memberId: input.memberId,
    authorDisplayName,
    finalAmount,
    cuotas,
    paymentDate,
    currency,
  })
}

// The currency the purchase will be saved in, once the card is known to
// hold it. Pesos when the caller said nothing, which is what every call
// written before a card could hold two currencies meant.
async function assertCardAccepts(
  db: HouseholdsDb,
  input: {
    readonly householdId: string
    readonly cardId: string
    readonly currency?: Currency
  },
): Promise<Currency> {
  const currency = input.currency ?? DEFAULT_CURRENCY
  const cards = await db.listCards({ householdId: input.householdId })
  const card = cards.find((candidate) => candidate.id === input.cardId)
  if (card === undefined) {
    throw new CardNotFoundError()
  }
  if (!cardAccepts(card.currency, currency)) {
    throw new CardCurrencyNotAcceptedError(card.name)
  }
  return currency
}

// Any field may change, card and cuotas included: the old cuotas leave their
// Resúmenes and the new ones join theirs, in one transaction.
export async function updateCardPurchase(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly purchaseId: string
  readonly cardId: string
  readonly categoryId: string
  readonly name: string
  readonly total: number
  readonly cuotas: number
  readonly purchaseDate: Date
  readonly comments: string
  readonly currency?: Currency
}): Promise<CardPurchase> {
  const name = parseExpenseName(input.name)
  const total = parseExpensePrice(input.total)
  const cuotas = parseCuotas(input.cuotas, total)
  const purchaseDate = parseExpenseDate(input.purchaseDate)
  const currency = await assertCardAccepts(input.db, input)
  // A new month -- or a new currency -- may need a new Resumen.
  const resumenCategory = await input.db.findOrCreateCategory({
    householdId: input.householdId,
    name: RESUMEN_CATEGORY_NAME,
  })
  return input.db.updateCardPurchase({
    householdId: input.householdId,
    purchaseId: input.purchaseId,
    cardId: input.cardId,
    categoryId: input.categoryId,
    resumenCategoryId: resumenCategory.id,
    name,
    total,
    cuotas,
    purchaseDate,
    comments: input.comments,
    currency,
  })
}

export async function deleteCardPurchase(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly purchaseId: string
}): Promise<void> {
  await input.db.deleteCardPurchase({
    householdId: input.householdId,
    purchaseId: input.purchaseId,
  })
}

// Newest first, like the Expenses they are listed beside.
export async function listCardPurchasesInMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}): Promise<readonly CardPurchase[]> {
  const purchases = await input.db.listCardPurchasesInMonth(input)
  return [...purchases].sort(
    (left, right) =>
      right.purchaseDate.getTime() - left.purchaseDate.getTime() ||
      right.createdAt.getTime() - left.createdAt.getTime(),
  )
}

export type ResumenCuota = {
  readonly purchase: CardPurchase
  readonly cuota: Cuota
}

// The cuotas a Resumen adds up: for each of its purchases, the one cuota
// that lands in the Resumen's month.
export async function listResumenCuotas(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumen: Pendiente
}): Promise<readonly ResumenCuota[]> {
  const purchases = await input.db.getCardPurchases({
    householdId: input.householdId,
    purchaseIds: input.resumen.purchaseIds ?? [],
  })
  return resumenCuotasOf(input.resumen, purchases)
}

function resumenCuotasOf(
  resumen: Pendiente,
  purchases: readonly CardPurchase[],
): readonly ResumenCuota[] {
  const year = resumen.dueDate.getFullYear()
  const month = resumen.dueDate.getMonth()
  return purchases.flatMap((purchase) => {
    const cuota = cuotasOf(purchase).find(
      (candidate) =>
        candidate.monthStart.getFullYear() === year &&
        candidate.monthStart.getMonth() === month,
    )
    return cuota === undefined ? [] : [{ purchase, cuota }]
  })
}

export function resumenMonthStart(resumen: Pendiente): Date {
  return new Date(resumen.dueDate.getFullYear(), resumen.dueDate.getMonth(), 1)
}

// The October Resumen is paid in October or later, never in September.
export function canPayResumen(resumen: Pendiente, today: Date): boolean {
  return today >= resumenMonthStart(resumen)
}

export type ResumenPaymentExpense = {
  readonly name: string
  readonly price: number
  // The purchase's category name; null on the ajuste.
  readonly subcategory: string | null
}

// What paying a Resumen writes, shared by both adapters: one Expense per
// cuota and, when the amount paid differs from the total, one "<card> —
// ajuste" for the difference (negative when less was paid). All of them
// count against the Resumen's month: dated on the payment date when it is
// in that month, otherwise on the month's last day.
export function resumenPayment(input: {
  readonly resumen: Pendiente
  readonly purchases: readonly CardPurchase[]
  readonly categoryNameById: ReadonlyMap<string, string>
  readonly amountPaid: number
  readonly paymentDate: Date
}): {
  readonly expenseDate: Date
  readonly expenses: readonly ResumenPaymentExpense[]
} {
  const monthStart = resumenMonthStart(input.resumen)
  if (input.paymentDate < monthStart) {
    throw new ResumenNotYetPayableError(input.resumen.name, monthStart)
  }
  const monthLastDay = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    0,
  )
  const expenseDate =
    input.paymentDate.getFullYear() === monthStart.getFullYear() &&
    input.paymentDate.getMonth() === monthStart.getMonth()
      ? input.paymentDate
      : monthLastDay
  const cuotas = resumenCuotasOf(input.resumen, input.purchases).map(
    ({ purchase, cuota }): ResumenPaymentExpense => ({
      name: purchase.name,
      price: cuota.amount,
      subcategory:
        input.categoryNameById.get(purchase.categoryId) ?? 'Sin categoría',
    }),
  )
  const totalCents = cuotas.reduce(
    (sum, cuota) => sum + Math.round(cuota.price * 100),
    0,
  )
  const ajusteCents = Math.round(input.amountPaid * 100) - totalCents
  return {
    expenseDate,
    expenses:
      ajusteCents === 0
        ? cuotas
        : [
            ...cuotas,
            {
              name: `${input.resumen.name} — ajuste`,
              price: ajusteCents / 100,
              subcategory: null,
            },
          ],
  }
}

// Loads what the card actually billed, once the statement closes. Until
// this runs a Resumen owes nothing: everything the household logged against
// the card is an estimate of this figure, never the figure itself. Per
// direct feedback -- "no se tiene que sumar automáticamente".
export async function setResumenAmount(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumenId: string
  readonly amount: number
}): Promise<Pendiente> {
  return input.db.setResumenAmount({
    householdId: input.householdId,
    resumenId: input.resumenId,
    // The same floor every amount in the app has: a resumen of nothing is
    // a resumen that did not arrive.
    amount: parseExpensePrice(input.amount),
  })
}

// Pays a card's Resumen in one transaction (see HouseholdsDb.markResumenPaid).
// Undoing it is unmarkPendientePaid, as for any Pendiente.
export async function markResumenPaid(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumenId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly amountPaid: number
  readonly paymentDate: Date
}): Promise<{
  readonly pendiente: Pendiente
  readonly expenses: readonly Expense[]
}> {
  const amountPaid = parseExpensePrice(input.amountPaid)
  const paymentDate = parseExpenseDate(input.paymentDate)
  const authorDisplayName = parseAuthorDisplayName(input.authorDisplayName)
  const tarjeta = await input.db.findOrCreateCategory({
    householdId: input.householdId,
    name: RESUMEN_CATEGORY_NAME,
  })
  // The Resumen's own currency decides what the expenses the payment writes
  // are denominated in -- not the card's, which may hold both and in any
  // case can be changed after the fact. A Resumen saved before a card could
  // hold two currencies carries none, and was a peso one.
  const resumen = await input.db.getPendiente({
    householdId: input.householdId,
    pendienteId: input.resumenId,
  })
  const currency = resumen?.currency ?? DEFAULT_CURRENCY
  return input.db.markResumenPaid({
    currency,
    householdId: input.householdId,
    resumenId: input.resumenId,
    memberId: input.memberId,
    authorDisplayName,
    amountPaid,
    paymentDate,
    tarjetaCategoryId: tarjeta.id,
  })
}

// Every card bill of the month after today's -- the ones "Tarjetas el mes
// que viene" adds up. Returned whole rather than summed so the screen can
// open them and show what each one is made of.
export function cardsDueNextMonth(
  pendientes: readonly Pendiente[],
  today: Date,
): readonly Pendiente[] {
  const { monthStart, monthEnd } = currentMonthRange(
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
  )
  return pendientesDueInMonth(pendientes, monthStart, monthEnd).filter(
    (pendiente) => pendiente.cardId !== undefined,
  )
}

export type CardsDueTotal = {
  readonly currency: Currency
  readonly total: number
}

// Home's "Tarjetas el mes que viene": always the calendar month after today,
// whichever month is on screen.
//
// One figure per currency, pesos first, and only the ones that are actually
// owed. It used to return a single peso number with the dollar Resumen
// dropped out of it -- which is right for a *budget* total, where mixing the
// two would make it a number of nothing, but wrong here: this is not a
// budget figure, it is what the cards are going to ask for, and a household
// whose only bill next month is in dollars was shown nothing at all. Per
// direct feedback. See lib/money/currency for why they are never added
// together.
export function cardsDueNextMonthTotals(
  pendientes: readonly Pendiente[],
  today: Date,
): readonly CardsDueTotal[] {
  const cents = new Map<Currency, number>()
  // The same list the sheet opens, so the figure and what it opens into can
  // never disagree about which bills are in it.
  for (const resumen of cardsDueNextMonth(pendientes, today)) {
    const currency = resumen.currency ?? DEFAULT_CURRENCY
    // Always the estimate: what the household has logged onto these cards
    // for next month. It used to prefer the bill once one had been loaded
    // by hand, which made this figure disagree with the consumos it opens
    // into -- a card headed "US$13,99" over US$13,99 and US$97. The loaded
    // bill is not lost: the sheet says it, beside the estimate it is being
    // compared with. Per direct feedback.
    const amount = resumen.estimatedAmount ?? 0
    cents.set(currency, (cents.get(currency) ?? 0) + Math.round(amount * 100))
  }
  return CURRENCY_ORDER.flatMap((currency) => {
    const amount = cents.get(currency) ?? 0
    return amount === 0 ? [] : [{ currency, total: amount / 100 }]
  })
}

// Pesos first: it is the household's own currency, and the one most months
// are entirely in.
const CURRENCY_ORDER: readonly Currency[] = ['ARS', 'USD']

// How a purchase reads in the movements list of its month, where it shows
// but does not count: "Visa · 3 cuotas · no suma este mes".
export function cardPurchaseMark(cardName: string, cuotas: number): string {
  const count = cuotas === 1 ? '1 cuota' : `${String(cuotas)} cuotas`
  return `${cardName} · ${count} · no suma este mes`
}

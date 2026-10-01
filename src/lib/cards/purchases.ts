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
}): Promise<CardPurchase> {
  const name = parseExpenseName(input.name)
  const total = parseExpensePrice(input.total)
  const cuotas = parseCuotas(input.cuotas, total)
  const purchaseDate = parseExpenseDate(input.purchaseDate)
  const authorDisplayName = parseAuthorDisplayName(input.authorDisplayName)
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
  })
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
}): Promise<CardPurchase> {
  const name = parseExpenseName(input.name)
  const total = parseExpensePrice(input.total)
  const cuotas = parseCuotas(input.cuotas, total)
  const purchaseDate = parseExpenseDate(input.purchaseDate)
  // A new month may need a new Resumen.
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
  return input.db.markResumenPaid({
    householdId: input.householdId,
    resumenId: input.resumenId,
    memberId: input.memberId,
    authorDisplayName,
    amountPaid,
    paymentDate,
    tarjetaCategoryId: tarjeta.id,
  })
}

// Home's "Tarjetas el mes que viene": always the calendar month after today,
// whichever month is on screen.
export function cardsDueNextMonthTotal(
  pendientes: readonly Pendiente[],
  today: Date,
): number {
  const { monthStart, monthEnd } = currentMonthRange(
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
  )
  const cents = pendientesDueInMonth(pendientes, monthStart, monthEnd)
    .filter((pendiente) => pendiente.cardId !== undefined)
    .reduce(
      (sum, resumen) => sum + Math.round((resumen.expectedAmount ?? 0) * 100),
      0,
    )
  return cents / 100
}

// How a purchase reads in the movements list of its month, where it shows
// but does not count: "Visa · 3 cuotas · no suma este mes".
export function cardPurchaseMark(cardName: string, cuotas: number): string {
  const count = cuotas === 1 ? '1 cuota' : `${String(cuotas)} cuotas`
  return `${cardName} · ${count} · no suma este mes`
}

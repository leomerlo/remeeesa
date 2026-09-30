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

export class CardNotFoundError extends Error {
  override readonly name = 'CardNotFoundError'

  constructor() {
    super('No se encontró la tarjeta.')
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
  const year = input.resumen.dueDate.getFullYear()
  const month = input.resumen.dueDate.getMonth()
  return purchases.flatMap((purchase) => {
    const cuota = cuotasOf(purchase).find(
      (candidate) =>
        candidate.monthStart.getFullYear() === year &&
        candidate.monthStart.getMonth() === month,
    )
    return cuota === undefined ? [] : [{ purchase, cuota }]
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

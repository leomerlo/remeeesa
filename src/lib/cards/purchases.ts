import {
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpenseName,
  parseExpensePrice,
} from '@/lib/expenses/validate'
import type { HouseholdsDb } from '@/lib/households/types'
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

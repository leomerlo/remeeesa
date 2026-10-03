import type { Currency } from '@/lib/money'
export type Card = {
  readonly id: string
  readonly householdId: string
  readonly name: string
  // The whole card is in one currency: its purchases, its Resúmenes, and
  // the expenses paying a Resumen creates. A dollar card's money is
  // recorded but never counted toward the budget -- see lib/money/currency.
  readonly currency: Currency
  readonly createdAt: Date
}

// Not an Expense: it counts against no month on its own. Its cuotas (see
// cuotasOf) count through the card's Resumen of each month they land in.
export type CardPurchase = {
  readonly id: string
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
  readonly createdAt: Date
  // The paid Resúmenes holding one of its cuotas. Non-empty locks the
  // purchase: it can no longer be edited or deleted (rules enforce it too).
  readonly paidResumenIds: readonly string[]
}

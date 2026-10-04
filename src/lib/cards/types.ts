import type { CardCurrency, Currency } from '@/lib/money'
export type Card = {
  readonly id: string
  readonly householdId: string
  readonly name: string
  // Which currencies this card holds. One of them, or 'BOTH' for a card
  // that is billed in pesos and in dollars -- each currency gets its own
  // Resumen per month, since the two totals cannot be added together.
  // Dollar money is recorded but never counted toward the budget; see
  // lib/money/currency.
  readonly currency: CardCurrency
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
  // The one currency this purchase is in, and therefore the Resúmenes its
  // cuotas land in. Always one of the card's -- see cardAccepts.
  readonly currency: Currency
  readonly createdAt: Date
  // The paid Resúmenes holding one of its cuotas. Non-empty locks the
  // purchase: it can no longer be edited or deleted (rules enforce it too).
  readonly paidResumenIds: readonly string[]
}

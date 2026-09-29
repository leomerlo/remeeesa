export type Card = {
  readonly id: string
  readonly householdId: string
  readonly name: string
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
}

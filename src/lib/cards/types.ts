import type { CardCurrency, Currency } from '@/lib/money'

// What a payment method *does* with the money, which is the only thing the
// app behaves differently about.
//
// Everything except 'credito' settles now: the gasto is money that has
// already left the household, so it belongs to the month it was made in and
// counts against that month's budget. 'credito' does not: it books a
// purchase whose cuotas land in a Resumen of a later month, which is what
// the household will actually be asked to pay. Per direct feedback.
//
// 'cuenta' is a balance you spend straight out of -- a Mercado Pago account
// being the one everybody here has. It is not debit and it is not credit:
// the money is already sitting there, so it behaves like cash, and it is
// named that way ("Efectivo en cuenta") rather than being filed under a
// card network it only passes through. Her words.
export type PaymentMethodKind = 'efectivo' | 'cuenta' | 'debito' | 'credito'

export const PAYMENT_METHOD_KINDS: readonly {
  readonly value: PaymentMethodKind
  readonly label: string
  // What picking it means for the month, said where it is picked.
  readonly detail: string
}[] = [
  {
    value: 'efectivo',
    label: 'Efectivo',
    detail: 'Plata en mano. El gasto es de este mes.',
  },
  {
    value: 'cuenta',
    label: 'Efectivo en cuenta',
    detail: 'Un saldo del que gastás directo, como Mercado Pago.',
  },
  {
    value: 'debito',
    label: 'Débito',
    detail: 'Sale de la cuenta en el momento. El gasto es de este mes.',
  },
  {
    value: 'credito',
    label: 'Crédito',
    detail: 'Va al resumen del mes que viene. No toca el presupuesto de hoy.',
  },
]

export function isPaymentMethodKind(
  value: unknown,
): value is PaymentMethodKind {
  return PAYMENT_METHOD_KINDS.some((kind) => kind.value === value)
}

// Every method written before kinds existed is a credit card: they were the
// only thing this collection could hold.
export function parsePaymentMethodKind(value: unknown): PaymentMethodKind {
  return isPaymentMethodKind(value) ? value : 'credito'
}

// Whether the money is gone the moment the gasto is logged. The single place
// that decides, so "is this month's" is one answer and not four.
export function settlesNow(kind: PaymentMethodKind): boolean {
  return kind !== 'credito'
}

// Which card it is, for the mark on its card and nothing else: the app
// never behaves differently because of it. 'otra' is the escape hatch and
// the default, including for every card created before this existed.
export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'mercadopago' | 'otra'

export const CARD_BRANDS: readonly {
  readonly value: CardBrand
  readonly label: string
}[] = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'otra', label: 'Otra' },
]

export function isCardBrand(value: unknown): value is CardBrand {
  return CARD_BRANDS.some((brand) => brand.value === value)
}

export function parseCardBrand(value: unknown): CardBrand {
  return isCardBrand(value) ? value : 'otra'
}

// A way the household pays for things: cash, a balance like Mercado Pago, a
// debit card, a credit card. It is called Card throughout the code and
// stored in the `cards` collection because that is what it was when there
// was only one kind, and renaming a live collection buys nothing a comment
// does not -- what the household sees is "Métodos de pago".
export type Card = {
  readonly id: string
  readonly householdId: string
  readonly name: string
  // What it does with the money. See settlesNow.
  readonly kind: PaymentMethodKind
  readonly brand: CardBrand
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

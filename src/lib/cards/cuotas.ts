import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'

export type Cuota = {
  // 1-based: cuota k of N.
  readonly number: number
  readonly amount: number
  // First day of the month whose Resumen this cuota lands in.
  readonly monthStart: Date
}

// Cuota k of a purchase dated in month M lands in the Resumen of month M + k.
// Worked in cents so the cuotas always sum exactly to the total: each is the
// total ÷ N rounded down, and the last one absorbs the remainder.
export function cuotasOf(input: {
  readonly total: number
  readonly cuotas: number
  readonly purchaseDate: Date
}): readonly Cuota[] {
  const cents = Math.round(input.total * 100)
  const base = Math.floor(cents / input.cuotas)
  const year = input.purchaseDate.getFullYear()
  const month = input.purchaseDate.getMonth()
  return Array.from({ length: input.cuotas }, (_, index) => {
    const number = index + 1
    const amountCents =
      number === input.cuotas ? cents - base * (input.cuotas - 1) : base
    return {
      number,
      amount: amountCents / 100,
      monthStart: new Date(year, month + number, 1),
    }
  })
}

// Deterministic so a transaction can tx.get the Resumen (client transactions
// cannot query).
//
// A card that holds both currencies has one Resumen per currency per month:
// a dollar cuota cannot be added into a peso total, so they are separate
// bills that are settled separately -- which is how the bank bills them
// too. Pesos keep the id this function returned before currencies existed,
// unsuffixed, so every Resumen already saved stays exactly where it is.
export function resumenIdFor(
  cardId: string,
  monthStart: Date,
  currency: Currency = DEFAULT_CURRENCY,
): string {
  const month = String(monthStart.getMonth() + 1).padStart(2, '0')
  const base = `${cardId}_${String(monthStart.getFullYear())}-${month}`
  return currency === DEFAULT_CURRENCY ? base : `${base}_${currency}`
}

// What a Resumen of a dollar purchase is called, so the two Resúmenes of
// the same card in the same month are told apart wherever they are listed.
export function resumenNameFor(cardName: string, currency: Currency): string {
  return currency === DEFAULT_CURRENCY ? cardName : `${cardName} US$`
}

type CuotaSource = {
  readonly cardId: string
  readonly total: number
  readonly cuotas: number
  readonly purchaseDate: Date
  readonly currency: Currency
}

// What editing or deleting a purchase does to one Resumen.
export type ResumenChange = {
  readonly id: string
  readonly monthStart: Date
  // Which of the card's Resúmenes of that month this is.
  readonly currency: Currency
  // Added to the Resumen's amount; negative when a cuota leaves it.
  readonly cents: number
  // Whether the purchase still has a cuota in this Resumen afterwards.
  readonly holdsPurchase: boolean
}

// Every Resumen the purchase is in before or after the change (null = none):
// the old cuotas come out, the new ones go in.
export function resumenChanges(
  before: CuotaSource | null,
  after: CuotaSource | null,
): readonly ResumenChange[] {
  const changes = new Map<string, ResumenChange>()
  const apply = (source: CuotaSource | null, sign: 1 | -1): void => {
    if (source === null) {
      return
    }
    for (const cuota of cuotasOf(source)) {
      const id = resumenIdFor(source.cardId, cuota.monthStart, source.currency)
      const current = changes.get(id)
      changes.set(id, {
        id,
        monthStart: cuota.monthStart,
        currency: source.currency,
        cents: (current?.cents ?? 0) + sign * Math.round(cuota.amount * 100),
        holdsPurchase: (current?.holdsPurchase ?? false) || sign === 1,
      })
    }
  }
  apply(before, -1)
  apply(after, 1)
  return [...changes.values()]
}

// The Resumen's amount and purchase list once the change lands, or null when
// no purchase is left in it (the Resumen is deleted).
export function applyResumenChange(
  resumen: {
    readonly expectedAmount: number | null
    readonly purchaseIds?: readonly string[] | undefined
  },
  change: ResumenChange,
  purchaseId: string,
): { readonly expectedAmount: number; readonly purchaseIds: string[] } | null {
  const ids = resumen.purchaseIds ?? []
  const purchaseIds = !change.holdsPurchase
    ? ids.filter((id) => id !== purchaseId)
    : ids.includes(purchaseId)
      ? [...ids]
      : [...ids, purchaseId]
  if (purchaseIds.length === 0) {
    return null
  }
  return {
    expectedAmount:
      (Math.round((resumen.expectedAmount ?? 0) * 100) + change.cents) / 100,
    purchaseIds,
  }
}

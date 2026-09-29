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
export function resumenIdFor(cardId: string, monthStart: Date): string {
  const month = String(monthStart.getMonth() + 1).padStart(2, '0')
  return `${cardId}_${String(monthStart.getFullYear())}-${month}`
}

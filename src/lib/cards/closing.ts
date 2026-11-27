// When the card closed, which decides which Resumen a purchase lands in.
//
// A credit card's statement does not close on the month's last day: this
// household's Visa closed on the 26th of November, and what was bought
// after that is not in that statement at all -- it is in the next one.
// Without this the app put a purchase of the 27th into December's Resumen
// while the bank put it into January's, and the two never agreed again.
//
// The day is not a fixed number either. Per direct feedback: "un día te
// cierra el 26, otro el 29 y es un caos". So what is stored is the day
// *from a given month onwards*: setting it in December leaves November's
// purchases exactly where the November cierre put them.

// 'YYYY-MM', the month a closing day starts applying from. Same shape as
// the key in a Resumen's id, so the two sort together and read the same.
export type ClosingMonth = string

export type Closings = Readonly<Record<ClosingMonth, number>>

export function closingMonthKey(date: Date): ClosingMonth {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}`
}

export function parseClosingDay(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('El día de cierre tiene que ser un número entero')
  }
  // 28 rather than 31: a cierre on the 29th, 30th or 31st does not exist in
  // every month, and a card that closed on the 31st of January would have
  // no cierre at all in February. The banks this is built for close in the
  // third or fourth week.
  if (value < 1 || value > 28) {
    throw new Error('El día de cierre va del 1 al 28')
  }
  return value
}

// Anything that is not a map of month to day is no cierre at all, which is
// how every card written before this existed reads: the app then places a
// purchase the way it always did, in the Resumen of the following month.
export function parseClosings(value: unknown): Closings {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) continue
    if (typeof day !== 'number' || !Number.isInteger(day)) continue
    if (day < 1 || day > 28) continue
    out[key] = day
  }
  return out
}

// The day in force for a month: the one set for it, or the most recent one
// set before it. That is what makes the field on the card behave the way
// it was asked for -- "si arrastra de un mes a otro, lo único que hay que
// hacer es modificarla" -- while a month that already happened keeps the
// cierre it actually had.
export function closingDayFor(
  closings: Closings,
  month: ClosingMonth,
): number | null {
  let best: { readonly key: string; readonly day: number } | null = null
  for (const [key, day] of Object.entries(closings)) {
    if (key > month) continue
    if (best === null || key > best.key) best = { key, day }
  }
  return best?.day ?? null
}

// Whether a purchase skips a Resumen: 1 when the card had already closed,
// 0 when it had not.
//
// On the day itself it has closed. Per the household's own statement: the
// cierre was the 26th and both purchases made on the 26th were listed as
// Pendiente, outside that statement's total -- so the comparison is "on or
// after", not "after".
export function closingShift(closings: Closings, purchaseDate: Date): 0 | 1 {
  const day = closingDayFor(closings, closingMonthKey(purchaseDate))
  if (day === null) return 0
  return purchaseDate.getDate() >= day ? 1 : 0
}

import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
// Argentine peso formatting: thousands separator "." and decimal "," (e.g.
// $224.300,50) -- no built-in Intl currency style here, since 'ARS' inserts
// a "$ " with a space that doesn't match how the app's own reference and
// every Argentine app actually renders amounts.
//
// Cents are shown only when there are any. Most amounts a household enters
// are round, and "$62.000,00" spends four characters saying nothing -- in a
// column of figures, and inside the narrow cards, that is the difference
// between a line fitting and wrapping. Per direct feedback. Amounts that do
// carry cents still show both digits, so "$45,5" never appears.
const ARS_ROUND = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const ARS_WITH_CENTS = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// Negative amounts keep their sign. They used to lose it: this took the
// magnitude and never printed a minus, so the one expense in the app that
// can be negative -- the "ajuste" written when a card Resumen is paid for
// less than it said -- appeared in Histórico as a positive figure. The
// month total above it subtracted the ajuste correctly, so the rows simply
// did not add up to the total they were under. Found in the arithmetic
// audit.
export function formatCurrency(amount: number): string {
  const magnitude = Math.abs(amount)
  // Rounded to cents first: 0.005 formats as "0,01" with cents, so the
  // decision has to be made on the value that will actually be printed.
  const cents = Math.round(magnitude * 100) % 100
  const format = cents === 0 ? ARS_ROUND : ARS_WITH_CENTS
  // Tested on the rounded value, so -0.001 is "$0" and not "-$0".
  const sign = Math.round(amount * 100) < 0 ? '-' : ''
  return `${sign}$${format.format(magnitude)}`
}

// The same figure, said in its own currency. Pesos keep the bare "$" the
// whole app uses; dollars get "US$", which is how an Argentine reads the
// difference at a glance -- "$" alone always means pesos here.
export function formatAmount(amount: number, currency: Currency): string {
  if (currency !== 'USD') {
    return formatCurrency(amount)
  }
  // "US" goes in front of the "$", not in front of the minus: -US$120, not
  // US-$120.
  const formatted = formatCurrency(amount)
  return formatted.startsWith('-')
    ? `-US${formatted.slice(1)}`
    : `US${formatted}`
}

// A money figure short enough to fit somewhere a full one cannot -- today,
// the hole in the category donut. "$1.883.200,50" becomes "$1,88 M" and
// "$883.200,50" becomes "$883 mil". Deliberately only used where the exact
// figure is printed somewhere close by: this one is a label, not a number
// anyone should do arithmetic with.
export function formatCompactCurrency(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const magnitude = Math.abs(amount)
  if (magnitude >= 1_000_000) {
    const millions = magnitude / 1_000_000
    // Two decimals below ten million, none above: "$12,34 M" is more digits
    // than the hole of a donut can carry.
    const digits = millions >= 10 ? 0 : 2
    return `${sign}$${millions.toFixed(digits).replace('.', ',')} M`
  }
  if (magnitude >= 1000) {
    return `${sign}$${String(Math.round(magnitude / 1000))} mil`
  }
  return `${sign}${formatCurrency(magnitude)}`
}

// Kept as its own name because it reads as what it is at the call sites
// that use it (a budget figure, which is the one that routinely goes
// negative), but it no longer adds anything: formatCurrency carries the
// sign itself now, and prefixing a second one here produced "--$50".
export function formatBudgetAmount(amount: number): string {
  return formatCurrency(amount)
}

// The one summation every figure on the budget card is derived from: what
// the household has actually spent this month. Shared rather than repeated
// per figure so "spent" always means the same sum everywhere it appears --
// the ascending "Gastado" card, the descending "Presupuesto restante" card,
// and the progress bar's percentage all read from this same number.
// Dollar amounts are left out, here and in every other figure the budget
// drives: the budget is a number of pesos, and adding a dollar to it would
// mean picking an exchange rate. See lib/money/currency.
export function computeSpentThisMonth(
  expenses: readonly { price: number; currency: Currency }[],
): number {
  let sum = 0
  for (const expense of countedByBudget(expenses)) {
    sum += expense.price
  }
  return sum
}

// Every currently-pending Pendiente's own expected amount, summed -- money
// already committed even though it hasn't left the household yet. A
// Pendiente with no expected amount yet (unknown, e.g. a variable bill)
// contributes nothing until it's known -- there's no number to add. Not
// scoped to any month: Cuentas por pagar itself shows every pending
// Pendiente regardless of due date (an overdue bill from three months ago
// stays actionable until paid), so "how much would paying everything owed
// take out of this budget" reads the same full list.
//
// Dollar Pendientes -- the dollar Resumen of a card billed in both
// currencies -- are left out, the same as every other dollar amount: this
// is a number of pesos being taken off a budget of pesos. A Pendiente
// written before a card could hold two currencies carries none, and was a
// peso one.
export function computePendingCommitted(
  pendientes: readonly {
    expectedAmount: number | null
    currency?: Currency
  }[],
): number {
  const counted = countedByBudget(
    pendientes.map((pendiente) => ({
      ...pendiente,
      currency: pendiente.currency ?? DEFAULT_CURRENCY,
    })),
  )
  let sum = 0
  for (const pendiente of counted) {
    if (pendiente.expectedAmount !== null) {
      sum += pendiente.expectedAmount
    }
  }
  return sum
}

export function computeRemainingBudget(
  monthlyBudget: number,
  expenses: readonly { price: number; currency: Currency }[],
  // Per direct feedback: the budget is meant to cover every expense, paid
  // or not, so a Pendiente still owed has to count against what's "left"
  // the same as a paid one already does -- not just once it's paid.
  pendingCommitted = 0,
): number {
  return monthlyBudget - computeSpentThisMonth(expenses) - pendingCommitted
}

// A 0 (or negative) monthlyBudget has nothing meaningful to divide by, so
// it's treated as 0% used with no spend and 100% used the moment there is
// any spend, rather than dividing by zero into NaN/Infinity.
//
// Not capped at 100: a month that is over budget reports 128%, and the card
// says so. It used to clamp, which meant a household $107.000 past its
// budget read "100% usado" beside a negative figure -- the one moment the
// number most needs to be blunt was the moment it stopped counting. The
// progress *bar* still clamps, since it has nowhere to put the overflow;
// that clamping belongs at the bar, not here. Per direct feedback.
export function computePercentUsed(
  monthlyBudget: number,
  expenses: readonly { price: number; currency: Currency }[],
  pendingCommitted = 0,
): number {
  const spent = computeSpentThisMonth(expenses) + pendingCommitted
  if (monthlyBudget <= 0) {
    return spent > 0 ? 100 : 0
  }
  const percent = Math.round((spent / monthlyBudget) * 100)
  return Math.max(0, percent)
}

export function currentMonthRange(now: Date = new Date()): {
  monthStart: Date
  monthEnd: Date
} {
  const year = now.getFullYear()
  const month = now.getMonth()
  return {
    monthStart: new Date(year, month, 1),
    monthEnd: new Date(year, month + 1, 0, 23, 59, 59, 999),
  }
}

export function isDateInCurrentMonth(
  date: Date,
  now: Date = new Date(),
): boolean {
  const { monthStart, monthEnd } = currentMonthRange(now)
  const time = date.getTime()
  return time >= monthStart.getTime() && time <= monthEnd.getTime()
}

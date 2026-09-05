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

export function formatCurrency(amount: number): string {
  const magnitude = Math.abs(amount)
  // Rounded to cents first: 0.005 formats as "0,01" with cents, so the
  // decision has to be made on the value that will actually be printed.
  const cents = Math.round(magnitude * 100) % 100
  const format = cents === 0 ? ARS_ROUND : ARS_WITH_CENTS
  return `$${format.format(magnitude)}`
}

export function formatBudgetAmount(amount: number): string {
  return amount < 0 ? `-${formatCurrency(amount)}` : formatCurrency(amount)
}

// The one summation every figure on the budget card is derived from: what
// the household has actually spent this month. Shared rather than repeated
// per figure so "spent" always means the same sum everywhere it appears --
// the ascending "Gastado" card, the descending "Presupuesto restante" card,
// and the progress bar's percentage all read from this same number.
export function computeSpentThisMonth(
  expenses: readonly { price: number }[],
): number {
  let sum = 0
  for (const expense of expenses) {
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
export function computePendingCommitted(
  pendientes: readonly { expectedAmount: number | null }[],
): number {
  let sum = 0
  for (const pendiente of pendientes) {
    if (pendiente.expectedAmount !== null) {
      sum += pendiente.expectedAmount
    }
  }
  return sum
}

export function computeRemainingBudget(
  monthlyBudget: number,
  expenses: readonly { price: number }[],
  // Per direct feedback: the budget is meant to cover every expense, paid
  // or not, so a Pendiente still owed has to count against what's "left"
  // the same as a paid one already does -- not just once it's paid.
  pendingCommitted = 0,
): number {
  return monthlyBudget - computeSpentThisMonth(expenses) - pendingCommitted
}

// A 0 (or negative) monthlyBudget has nothing meaningful to divide by, so
// it's treated as 0% used with no spend and 100% used the moment there is
// any spend, rather than dividing by zero into NaN/Infinity. Any result is
// clamped to [0, 100] and rounded to the nearest whole percent -- spending
// past the budget reports 100%, not e.g. 150%, since a progress bar has
// nowhere to put the overflow (computeRemainingBudget already surfaces the
// exact over-budget amount as a negative remaining).
export function computePercentUsed(
  monthlyBudget: number,
  expenses: readonly { price: number }[],
  pendingCommitted = 0,
): number {
  const spent = computeSpentThisMonth(expenses) + pendingCommitted
  if (monthlyBudget <= 0) {
    return spent > 0 ? 100 : 0
  }
  const percent = Math.round((spent / monthlyBudget) * 100)
  return Math.min(100, Math.max(0, percent))
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

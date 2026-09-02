// Argentine peso formatting: thousands separator "." and decimal "," (e.g.
// $224.300,00), always 2 decimals to match parseExpensePrice's stored
// precision -- no built-in Intl currency style here, since 'ARS' inserts a
// "$ " with a space that doesn't match how the app's own reference and
// every Argentine app actually renders amounts.
const ARS_NUMBER_FORMAT = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCurrency(amount: number): string {
  return `$${ARS_NUMBER_FORMAT.format(Math.abs(amount))}`
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

export function computeRemainingBudget(
  monthlyBudget: number,
  expenses: readonly { price: number }[],
): number {
  return monthlyBudget - computeSpentThisMonth(expenses)
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
): number {
  const spent = computeSpentThisMonth(expenses)
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

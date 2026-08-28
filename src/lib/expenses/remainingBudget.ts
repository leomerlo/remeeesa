export function formatBudgetAmount(amount: number): string {
  const absolute = Math.abs(amount)
  const digits = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(2)
  return amount < 0 ? `-$${digits}` : `$${digits}`
}

export function computeRemainingBudget(
  monthlyBudget: number,
  expenses: readonly { price: number }[],
): number {
  let sum = 0
  for (const expense of expenses) {
    sum += expense.price
  }
  return monthlyBudget - sum
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

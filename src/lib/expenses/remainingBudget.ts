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

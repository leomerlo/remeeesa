export function categoriesQueryKey(input: {
  readonly householdId: string
}): readonly ['categories', string] {
  return ['categories', input.householdId]
}

export function expensesInMonthQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses-in-month', string] {
  return ['expenses-in-month', input.householdId]
}

export function expenseListQueryKey(input: {
  readonly householdId: string
  readonly year: number
  readonly month: number
}): readonly ['expense-list', string, number, number] {
  return ['expense-list', input.householdId, input.year, input.month]
}

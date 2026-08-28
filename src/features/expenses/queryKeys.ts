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

export function categoriesQueryKey(input: {
  readonly householdId: string
}): readonly ['categories', string] {
  return ['categories', input.householdId]
}

// Prefix shared by every expenses-entity query for a household. Passing
// this prefix to queryClient.invalidateQueries() invalidates it and every
// key nested under it (month-scoped, recent, and any future one) in a
// single call, instead of hand-enumerating each leaf key at every mutation
// site.
export function expensesQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses', string] {
  return ['expenses', input.householdId]
}

export function expensesInMonthQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses', string, 'month'] {
  return [...expensesQueryKey(input), 'month']
}

export function recentExpensesQueryKey(input: {
  readonly householdId: string
  readonly limit: number
}): readonly ['expenses', string, 'recent', number] {
  return [...expensesQueryKey(input), 'recent', input.limit]
}

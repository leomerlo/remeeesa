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

// The all-time, month-paginated feed behind Histórico. Nested under the
// shared expenses prefix so a mutation from any screen -- including a date
// edit that moves an expense across the current-month boundary -- refetches
// it along with everything else, rather than needing its own invalidation.
export function expenseHistoryQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses', string, 'history'] {
  return [...expensesQueryKey(input), 'history']
}

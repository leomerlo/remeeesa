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

// Every expense the household has, unpaginated -- the shape behind both
// Histórico's search (which has to look past the month being viewed) and
// Home's onboarding checklist (which asks whether a first gasto exists at
// all). One key so the two share a single fetch.
export function allExpensesQueryKey(input: {
  readonly householdId: string
}): readonly ['expenses', string, 'all'] {
  return [...expensesQueryKey(input), 'all']
}

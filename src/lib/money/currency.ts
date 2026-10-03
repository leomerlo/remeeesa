// The two currencies a household actually deals in. Pesos are the budget's
// currency: every figure the budget counts is in pesos, because the budget
// itself is a number of pesos.
//
// Dollars are recorded but deliberately *not* counted. Converting them
// would mean picking a rate -- which rate, on which day, and who decides --
// and a budget that silently moves with the dólar blue is worse than one
// that plainly says "this is in dollars and is not in here". Per direct
// feedback: for now a dollar amount is logged, labelled, and left out.
export type Currency = 'ARS' | 'USD'

export const DEFAULT_CURRENCY: Currency = 'ARS'

export function isCurrency(value: unknown): value is Currency {
  return value === 'ARS' || value === 'USD'
}

// Anything written before currencies existed is in pesos: a household that
// had no way to record a dollar cannot have recorded one.
export function parseCurrency(value: unknown): Currency {
  return isCurrency(value) ? value : DEFAULT_CURRENCY
}

// Whether this amount is one the budget counts. The single place that
// decides, so a new figure somewhere cannot quietly start adding dollars to
// pesos -- see countedByBudget below for the list it guards.
export function countsTowardBudget(input: { readonly currency: Currency }) {
  return input.currency === DEFAULT_CURRENCY
}

// The subset of a list that the budget counts. Every peso figure in the app
// goes through this: remaining budget, spent this month, the category
// breakdown, the projections and Histórico's month total.
export function countedByBudget<T extends { readonly currency: Currency }>(
  items: readonly T[],
): readonly T[] {
  return items.filter(countsTowardBudget)
}

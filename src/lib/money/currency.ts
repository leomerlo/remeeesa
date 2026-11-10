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

// What currencies a card can hold. A real credit card in Argentina often
// carries both: pesos for everything local and dollars for the purchases
// the bank bills in dollars, each settled as its own resumen. 'BOTH' says
// the card does that, and is what makes the currency a per-purchase choice
// instead of a property of the card. Per direct feedback.
export type CardCurrency = Currency | 'BOTH'

export function isCardCurrency(value: unknown): value is CardCurrency {
  return isCurrency(value) || value === 'BOTH'
}

// Same reasoning as parseCurrency: a card written before this existed holds
// exactly one currency, and pesos when it does not say which.
export function parseCardCurrency(value: unknown): CardCurrency {
  return isCardCurrency(value) ? value : DEFAULT_CURRENCY
}

// The currencies a purchase on this card may be in, in the order they are
// offered. A single-currency card offers exactly one, which is why the form
// shows a fixed label there rather than a choice.
export function currenciesOf(card: CardCurrency): readonly Currency[] {
  return card === 'BOTH' ? ['ARS', 'USD'] : [card]
}

// Which currency a new purchase on this card starts in. Pesos whenever the
// card holds them at all: on a both-currencies card the dollar purchase is
// the exception, the same way it is off a card.
export function defaultCurrencyOf(card: CardCurrency): Currency {
  return card === 'USD' ? 'USD' : DEFAULT_CURRENCY
}

// Whether a purchase in this currency can go on this card. Guards the one
// case the UI cannot: a card narrowed from 'BOTH' to a single currency
// while a form was open on the other one.
export function cardAccepts(card: CardCurrency, currency: Currency): boolean {
  return currenciesOf(card).includes(currency)
}

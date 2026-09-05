// The budget hero card's own colour, as a function of how much of the
// month's budget is gone. Per direct feedback: it starts on the brand
// violet and turns red as it approaches 100%, so the card itself says how
// close to the edge the household is before the numbers are read.
//
// The two ends are the gradient's two stops, kept as a pair so the card
// stays a gradient the whole way rather than collapsing to a flat colour
// somewhere in the middle. CALM must stay identical to --surface-action and
// --surface-action-gradient-end in src/index.css; src/lib/a11y/tokens.test.ts
// asserts that, so the card cannot drift away from the rest of the app.
//
// Every colour this can return carries white text at 4.5:1 or better --
// the whole ramp is asserted in budgetHeat.test.ts, not just its ends.

// grey-900 into grey-950. With nothing owing, the card is simply the
// darkest surface in the app -- the warning is the only colour on it.
export const BUDGET_GRADIENT_CALM = {
  from: '#2c2b30',
  to: '#1d1c20',
} as const

// wine-600 into wine-800 -- exactly what "Vencimientos que se acercan" is
// filled with, so a budget at its limit and a bill about to come due are
// visibly the same warning rather than two different reds.
export const BUDGET_GRADIENT_SPENT = {
  from: '#a52935',
  to: '#681627',
} as const

export type BudgetGradient = {
  readonly from: string
  readonly to: string
}

function mix(from: string, to: string, amount: number): string {
  const channels = [0, 2, 4].map((offset) => {
    const a = parseInt(from.slice(offset + 1, offset + 3), 16)
    const b = parseInt(to.slice(offset + 1, offset + 3), 16)
    return Math.round(a + (b - a) * amount)
      .toString(16)
      .padStart(2, '0')
  })
  return `#${channels.join('')}`
}

// Cubed rather than linear: on a linear ramp the card is visibly warm by
// the middle of the month, which is exactly when there is nothing to warn
// about yet. It was squared while the calm end was violet, where a little
// red still read as violet; from a neutral charcoal any red at all shows
// immediately, so the curve had to get steeper to hold the card grey
// through the early spend and turn over the last quarter.
export function budgetGradient(percentUsed: number): BudgetGradient {
  const clamped = Math.min(100, Math.max(0, percentUsed))
  const heat = (clamped / 100) ** 3
  return {
    from: mix(BUDGET_GRADIENT_CALM.from, BUDGET_GRADIENT_SPENT.from, heat),
    to: mix(BUDGET_GRADIENT_CALM.to, BUDGET_GRADIENT_SPENT.to, heat),
  }
}

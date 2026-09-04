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
export const BUDGET_GRADIENT_CALM = {
  from: '#6543f5',
  to: '#2c06c6',
} as const

// red-600 and red-800. red-500 is the brighter, more obvious red, but white
// on it is 4.16:1 -- under AA, and this card is white text on colour.
export const BUDGET_GRADIENT_SPENT = {
  from: '#ad261c',
  to: '#701812',
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

// Squared rather than linear: at a linear ramp the card is visibly warm by
// the middle of the month, which is exactly when there is nothing to warn
// about yet. Squaring holds the violet through the early spend and moves
// most of the way to red over the last third.
export function budgetGradient(percentUsed: number): BudgetGradient {
  const clamped = Math.min(100, Math.max(0, percentUsed))
  const heat = (clamped / 100) ** 2
  return {
    from: mix(BUDGET_GRADIENT_CALM.from, BUDGET_GRADIENT_SPENT.from, heat),
    to: mix(BUDGET_GRADIENT_CALM.to, BUDGET_GRADIENT_SPENT.to, heat),
  }
}

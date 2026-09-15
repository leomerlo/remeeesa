// The budget hero card's own colour, as a function of how much of the
// month's budget is gone. Per direct feedback: it starts on the darkest
// surface in the app and turns toward the danger colour as it approaches
// 100%, so the card itself says how close to the edge the household is
// before the numbers are read.
//
// One flat colour, not a gradient: the app has no gradients any more, per
// direct feedback. CALM must stay identical to --surface-action in
// src/index.css and SPENT to --surface-due-soon; src/lib/a11y/tokens.test.ts
// asserts both, so the card cannot drift away from the rest of the app.
//
// Every colour this can return carries white text at 4.5:1 or better --
// the whole ramp is asserted in budgetHeat.test.ts, not just its ends.

// grey-900. With nothing owing, the card is simply the darkest surface in
// the app -- the warning is the only colour on it.
export const BUDGET_CALM = '#2c2b30'

// rose-500 -- exactly what "Vencimientos que se acercan" is filled with and
// what the destructive button is filled with, so a budget at its limit and
// a bill about to come due are visibly the same warning rather than two
// different reds.
export const BUDGET_SPENT = '#b33667'

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
// about yet. From a neutral charcoal any colour at all shows immediately,
// so the curve is steep enough to hold the card grey through the early
// spend and turn over the last quarter.
export function budgetColor(percentUsed: number): string {
  const clamped = Math.min(100, Math.max(0, percentUsed))
  const heat = (clamped / 100) ** 3
  return mix(BUDGET_CALM, BUDGET_SPENT, heat)
}

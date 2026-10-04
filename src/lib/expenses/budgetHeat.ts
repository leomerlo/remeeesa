// The budget hero card's own colour, as a function of how much of the
// month's budget is gone. Per direct feedback: the card itself says how
// close to the edge the household is before the numbers are read.
//
// It used to interpolate one flat colour along a charcoal-to-rose ramp.
// It now picks one of three gradient cards instead -- the ladder the whole
// visual system is built on (see the --stat-* tokens in src/index.css):
//
//   celeste  ok.       There is room left in the month.
//   fucsia   warning.  It is getting tight. Loud enough to be noticed and
//                      no louder -- per direct feedback, a pink is not an
//                      emergency.
//   rojo     danger.   At the limit, or past it. The only one that reads
//                      as a red, which is why it is the last step and not
//                      the middle one it used to be.
//
// Being *past* the budget is not a fifth colour -- it is the same danger
// card -- but it is a different sentence, so the words and the colour are
// two separate functions of the same percentage.
//
// Three steps rather than a continuous ramp because the card is being read
// at a glance, and "which of three colours is it" is a judgement a glance
// can actually make -- a colour 40% of the way along a ramp is not. Each
// step is also a thing that can be said in words, which is what the
// aria-label on the card now says.
//
// Every gradient here carries white at 4.5:1 or better at *both* of its
// stops; src/lib/a11y/tokens.test.ts asserts that for all four.

export type BudgetTone = 'sky' | 'pink' | 'red'

// Below this share of the budget spent, the month is simply fine.
export const BUDGET_TIGHT_AT = 70

// At or above this, the card turns red: what is left is not going to cover
// the rest of the month. Deliberately late -- per direct feedback, the
// warning step has to have room to be a warning, and a card that goes red at
// 90 is red for most of a normal month.
export const BUDGET_SPENT_AT = 96

export function budgetTone(percentUsed: number): BudgetTone {
  if (percentUsed >= BUDGET_SPENT_AT) {
    return 'red'
  }
  return percentUsed >= BUDGET_TIGHT_AT ? 'pink' : 'sky'
}

// The gradient class for a tone. Spelled out rather than built by
// interpolation so Tailwind's scanner can see every one of them. No shadow:
// nothing in this app casts one (see src/index.css).
const TONE_CLASS: Readonly<Record<BudgetTone, string>> = {
  sky: 'bg-stat-sky',
  pink: 'bg-stat-pink',
  red: 'bg-stat-red',
}

export function budgetToneClass(tone: BudgetTone): string {
  return TONE_CLASS[tone]
}

// What the colour means, for anyone who is not reading the colour. Said on
// the card itself rather than only in its aria-label: a household at 92%
// should be told so in words, not only in fuchsia.
//
// Keyed on the percentage, not the tone, because the last two steps share a
// colour and do not share a meaning: "casi sin margen" and "ya te pasaste"
// are the difference between a warning and a fact, and a household that is
// $107.000 over should be told the second one.
export function budgetToneLabel(percentUsed: number): string {
  if (percentUsed > 100) {
    return 'Ya estás en negativo'
  }
  if (percentUsed >= BUDGET_SPENT_AT) {
    return 'Casi sin margen'
  }
  return percentUsed >= BUDGET_TIGHT_AT ? 'Se está ajustando' : 'Vas bien'
}

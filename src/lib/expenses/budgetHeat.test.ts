import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/a11y/contrast'
import {
  BUDGET_GRADIENT_CALM,
  BUDGET_GRADIENT_SPENT,
  budgetGradient,
} from './budgetHeat'

// How red a colour is, as a single comparable number: red channel gained
// minus blue channel lost. Enough to assert the ramp only ever moves toward
// red, without pinning it to exact hex values a designer may retune.
function warmth(hex: string): number {
  const red = parseInt(hex.slice(1, 3), 16)
  const blue = parseInt(hex.slice(5, 7), 16)
  return red - blue
}

describe('budgetGradient', () => {
  it('is the untouched brand violet with nothing spent', () => {
    expect(budgetGradient(0)).toEqual(BUDGET_GRADIENT_CALM)
  })

  it('is fully red once the budget is used up', () => {
    expect(budgetGradient(100)).toEqual(BUDGET_GRADIENT_SPENT)
  })

  it('gets warmer, never cooler, as more of the budget goes', () => {
    let previous = -Infinity
    for (let percent = 0; percent <= 100; percent += 1) {
      const current = warmth(budgetGradient(percent).from)
      expect(current).toBeGreaterThanOrEqual(previous)
      previous = current
    }
  })

  it('still reads as violet at the halfway mark', () => {
    // Half the budget spent is not a warning, so the card should not look
    // like one: blue still clearly leads red.
    expect(warmth(budgetGradient(50).from)).toBeLessThan(0)
  })

  it('has clearly turned red by the time the budget is nearly gone', () => {
    expect(warmth(budgetGradient(94).from)).toBeGreaterThan(0)
  })

  it('clamps instead of extrapolating past either end', () => {
    // computePercentUsed clamps at 100, but a negative or overshooting
    // value here must not produce a colour outside the ramp.
    expect(budgetGradient(-20)).toEqual(BUDGET_GRADIENT_CALM)
    expect(budgetGradient(180)).toEqual(BUDGET_GRADIENT_SPENT)
  })

  it('carries white text at AA across the whole ramp, not just its ends', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const { from, to } = budgetGradient(percent)
      expect(
        contrastRatio('#ffffff', from),
        `gradient start at ${String(percent)}% is ${from}`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastRatio('#ffffff', to),
        `gradient end at ${String(percent)}% is ${to}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

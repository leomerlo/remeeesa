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

// How far one colour is from another, straight-line through RGB. Rough, but
// enough to say which end of the ramp a midpoint belongs to.
function distance(from: string, to: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const a = parseInt(from.slice(offset, offset + 2), 16)
    const b = parseInt(to.slice(offset, offset + 2), 16)
    return (a - b) ** 2
  })
  return Math.sqrt(channels.reduce((sum, value) => sum + value, 0))
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
      // One unit of slack: the channels are rounded to whole bytes
      // independently, so a step can round the wrong way by one without the
      // ramp actually turning back on itself.
      expect(current).toBeGreaterThanOrEqual(previous - 1)
      previous = current
    }
    expect(warmth(budgetGradient(100).from)).toBeGreaterThan(
      warmth(budgetGradient(0).from),
    )
  })

  it('is still much nearer its calm end at the halfway mark', () => {
    // Half the budget spent is not a warning, so the card should not look
    // like one yet.
    const midpoint = budgetGradient(50).from
    expect(distance(midpoint, BUDGET_GRADIENT_CALM.from)).toBeLessThan(
      distance(midpoint, BUDGET_GRADIENT_SPENT.from),
    )
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

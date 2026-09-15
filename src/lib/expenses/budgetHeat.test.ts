import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/a11y/contrast'
import { BUDGET_CALM, BUDGET_SPENT, budgetColor } from './budgetHeat'

// How warm a colour is, as a single comparable number: red channel gained
// minus blue channel lost. Enough to assert the ramp only ever moves toward
// the danger colour, without pinning it to exact hex values a designer may
// retune.
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

describe('budgetColor', () => {
  it("is the app's darkest surface with nothing spent", () => {
    expect(budgetColor(0)).toBe(BUDGET_CALM)
  })

  it('is the full danger colour once the budget is used up', () => {
    expect(budgetColor(100)).toBe(BUDGET_SPENT)
  })

  it('gets warmer, never cooler, as more of the budget goes', () => {
    let previous = -Infinity
    for (let percent = 0; percent <= 100; percent += 1) {
      const current = warmth(budgetColor(percent))
      // One unit of slack: the channels are rounded to whole bytes
      // independently, so a step can round the wrong way by one without the
      // ramp actually turning back on itself.
      expect(current).toBeGreaterThanOrEqual(previous - 1)
      previous = current
    }
    expect(warmth(budgetColor(100))).toBeGreaterThan(warmth(budgetColor(0)))
  })

  it('is still much nearer its calm end at the halfway mark', () => {
    // Half the budget spent is not a warning, so the card should not look
    // like one yet.
    const midpoint = budgetColor(50)
    expect(distance(midpoint, BUDGET_CALM)).toBeLessThan(
      distance(midpoint, BUDGET_SPENT),
    )
  })

  it('has clearly turned by the time the budget is nearly gone', () => {
    expect(warmth(budgetColor(94))).toBeGreaterThan(0)
  })

  it('clamps instead of extrapolating past either end', () => {
    // computePercentUsed clamps at 100, but a negative or overshooting
    // value here must not produce a colour outside the ramp.
    expect(budgetColor(-20)).toBe(BUDGET_CALM)
    expect(budgetColor(180)).toBe(BUDGET_SPENT)
  })

  it('carries white text at AA across the whole ramp, not just its ends', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      const color = budgetColor(percent)
      expect(
        contrastRatio('#ffffff', color),
        `the card at ${String(percent)}% is ${color}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

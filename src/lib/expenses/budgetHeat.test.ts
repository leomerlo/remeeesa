import { describe, expect, it } from 'vitest'
import {
  BUDGET_SPENT_AT,
  BUDGET_TIGHT_AT,
  budgetTone,
  budgetToneClass,
  budgetToneLabel,
} from './budgetHeat'

describe('budgetTone', () => {
  it('is calm while there is room in the month', () => {
    expect(budgetTone(0)).toBe('sky')
    expect(budgetTone(BUDGET_TIGHT_AT - 1)).toBe('sky')
  })

  it('warns from the moment the month gets tight', () => {
    expect(budgetTone(BUDGET_TIGHT_AT)).toBe('pink')
    expect(budgetTone(BUDGET_SPENT_AT - 1)).toBe('pink')
  })

  it('is the danger colour from the moment there is no margin left', () => {
    expect(budgetTone(BUDGET_SPENT_AT)).toBe('red')
    expect(budgetTone(100)).toBe('red')
  })

  // Overspending is a real state the card has to render, not an error.
  it('stays on danger past 100%', () => {
    expect(budgetTone(180)).toBe('red')
  })

  // The warning step has to have room to be a warning: per direct feedback a
  // card that turns red at 90 is red for most of a normal month.
  it('leaves a real stretch between the warning and the red', () => {
    expect(BUDGET_SPENT_AT - BUDGET_TIGHT_AT).toBeGreaterThanOrEqual(25)
  })

  it('treats a nonsensical negative as the calm end', () => {
    expect(budgetTone(-20)).toBe('sky')
  })

  // The ladder only means anything if the three steps are three different
  // cards; a copy-paste in the table would silently collapse two of them.
  it('gives each step its own gradient', () => {
    const tones = ['sky', 'pink', 'red'] as const
    const classes = tones.map(budgetToneClass)
    expect(new Set(classes).size).toBe(3)
    for (const className of classes) {
      expect(className).toMatch(/^bg-stat-\w+$/)
    }
  })
})

describe('budgetToneLabel', () => {
  it('says the three steps of the ladder in words', () => {
    expect(budgetToneLabel(0)).toBe('Vas bien')
    expect(budgetToneLabel(BUDGET_TIGHT_AT)).toBe('Se está ajustando')
    expect(budgetToneLabel(BUDGET_SPENT_AT)).toBe('Casi sin margen')
  })

  // The one case the colour alone cannot tell apart: past the budget is the
  // same danger card as nearly-at-it, and a completely different sentence.
  it('says plainly that the month is already over, not "almost"', () => {
    expect(budgetToneLabel(101)).toBe('Ya estás en negativo')
    expect(budgetToneLabel(128)).toBe('Ya estás en negativo')
  })

  // Exactly spent is not yet overspent.
  it('treats exactly 100% as no margin left rather than negative', () => {
    expect(budgetToneLabel(100)).toBe('Casi sin margen')
  })
})

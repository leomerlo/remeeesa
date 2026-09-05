import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/a11y/contrast'
import { CATEGORY_COLOR_PALETTE } from './categoryColor'
import { categoryBadgeColors } from './categoryBadge'

describe('categoryBadgeColors', () => {
  it('reads at AA for every colour in the palette', () => {
    expect(CATEGORY_COLOR_PALETTE.length).toBeGreaterThan(0)
    for (const color of CATEGORY_COLOR_PALETTE) {
      const { background, foreground } = categoryBadgeColors(color)
      expect(
        contrastRatio(foreground, background),
        `${color} badge: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('holds up for colours the palette would never pick', () => {
    // A household can end up with any colour through the picker, including
    // the two extremes and a mid-yellow, which is the classic case where a
    // colour is far too light to print as text.
    for (const color of ['#ffffff', '#000000', '#ffff00', '#00ff00']) {
      const { background, foreground } = categoryBadgeColors(color)
      expect(
        contrastRatio(foreground, background),
        `${color} badge: ${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the chip pale so the name stays the loudest thing on it', () => {
    const { background } = categoryBadgeColors('#7b5cfa')
    // Nearly white: a saturated chip would compete with the row's own text.
    expect(contrastRatio(background, '#ffffff')).toBeLessThan(1.6)
  })

  it('leaves a dark enough colour untouched', () => {
    // Already 4.5:1 on its own pale chip -- no need to darken it further,
    // and darkening regardless would drift every badge toward black.
    const { foreground } = categoryBadgeColors('#2d7648')
    expect(foreground).toBe('#2d7648')
  })
})

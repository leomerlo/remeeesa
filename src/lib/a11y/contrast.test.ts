import { describe, expect, it } from 'vitest'
import { contrastRatio, parseHexColor, relativeLuminance } from './contrast'

describe('contrastRatio', () => {
  it('gives the maximum ratio for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  it('gives 1 for a colour against itself', () => {
    expect(contrastRatio('#7b5cfa', '#7b5cfa')).toBeCloseTo(1, 10)
  })

  it('does not care which colour is named first', () => {
    expect(contrastRatio('#5f5d69', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#5f5d69'),
      10,
    )
  })

  it('matches a known published value', () => {
    // #767676 on white is the canonical "smallest grey that passes AA".
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5)
  })

  it('accepts shorthand hex and ignores a missing #', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255])
    expect(relativeLuminance('ffffff')).toBeCloseTo(1, 10)
  })

  it('rejects anything that is not a colour', () => {
    expect(() => parseHexColor('var(--color-purple-400)')).toThrow()
  })
})

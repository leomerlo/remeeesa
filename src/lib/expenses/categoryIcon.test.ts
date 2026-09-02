import { describe, expect, it } from 'vitest'
import { iconForCategoryName } from './categoryIcon'

describe('iconForCategoryName', () => {
  it('maps a known category to a specific icon', () => {
    expect(iconForCategoryName('Comida')).toBe(iconForCategoryName('comida'))
    expect(iconForCategoryName('Comida')).not.toBe(
      iconForCategoryName('Transporte'),
    )
  })

  // Regression: this household's real categories are "Delivery" and "Café",
  // neither of which was mapped originally, so both fell through to the same
  // generic fallback and every row on Home showed an identical wallet glyph.
  it("gives this household's real categories distinct icons", () => {
    const delivery = iconForCategoryName('Delivery')
    const cafe = iconForCategoryName('Café')
    expect(delivery).not.toBe(cafe)
  })

  it('ignores case and accents when matching', () => {
    const canonical = iconForCategoryName('cafe')
    expect(iconForCategoryName('Café')).toBe(canonical)
    expect(iconForCategoryName('CAFÉ')).toBe(canonical)
    expect(iconForCategoryName('  café  ')).toBe(canonical)
  })

  it('is stable for the same name', () => {
    expect(iconForCategoryName('Cualquier cosa')).toBe(
      iconForCategoryName('Cualquier cosa'),
    )
  })

  it('spreads unmapped names across more than one fallback icon', () => {
    // The point of hashing the fallback: two unmapped categories should not
    // reliably collapse to the same glyph the way a single generic default
    // would.
    const unmapped = [
      'Zapatillas raras',
      'Cumpleaños de Tito',
      'Cosas del barco',
      'Plantas',
      'Jueguitos',
      'Herrería',
      'Cursos',
      'Vinos',
    ]
    const distinct = new Set(unmapped.map((name) => iconForCategoryName(name)))
    expect(distinct.size).toBeGreaterThan(1)
  })
})

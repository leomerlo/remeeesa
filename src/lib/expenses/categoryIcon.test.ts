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

  // Per direct feedback: "Michis" is what this household calls its cats, and
  // it was falling through to a generic fallback glyph.
  it('gives the cats a cat, not a generic glyph or the pets paw print', () => {
    const michis = iconForCategoryName('Michis')
    expect(michis).toBe(iconForCategoryName('gatos'))
    expect(michis).not.toBe(iconForCategoryName('Mascotas'))
    expect(michis).not.toBe(iconForCategoryName('Zapatillas raras'))
  })

  // The rest of this household's real category list. Each of these used to
  // fall through to a hashed fallback, so several unrelated categories wore
  // the same glyph.
  it('maps the names this household actually uses, keeping them distinguishable', () => {
    const byName = (name: string) => iconForCategoryName(name)

    // Each of these now resolves to the same icon as its canonical synonym,
    // which is what proves it's mapped rather than hashed into a fallback.
    expect(byName('Tarjeta de crédito')).toBe(byName('tarjeta'))
    expect(byName('ARCA')).toBe(byName('afip'))
    expect(byName('Deudas')).toBe(byName('deuda'))
    expect(byName('Herramientas digitales')).toBe(byName('software'))
    expect(byName('Meta Ads Flor')).toBe(byName('publicidad'))
    expect(byName('Almuerzo')).toBe(byName('restaurante'))
    expect(byName('Uber / Cabi')).toBe(byName('uber'))

    // And the full list still reads as fifteen different categories, not a
    // wall of the same glyph -- a few deliberate overlaps aside (Super and
    // Comida both being a cart, say).
    const all = [
      'Tarjeta de crédito',
      'Casa',
      'Deudas',
      'Salud',
      'ARCA',
      'Michis',
      'Auto',
      'Gimnasio',
      'Meta Ads Flor',
      'Café',
      'Delivery',
      'Herramientas digitales',
      'Almuerzo',
      'Super',
      'Uber / Cabi',
    ]
    expect(new Set(all.map(byName)).size).toBeGreaterThanOrEqual(12)
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

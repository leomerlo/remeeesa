import { describe, expect, it } from 'vitest'
import { CATEGORY_COLOR_PALETTE, colorForCategoryName } from './categoryColor'

describe('colorForCategoryName', () => {
  it('returns the same color for the same name', () => {
    expect(colorForCategoryName('Comida')).toBe(colorForCategoryName('Comida'))
  })

  it('is case and whitespace insensitive, matching categoryDocumentId normalization', () => {
    expect(colorForCategoryName('Comida')).toBe(
      colorForCategoryName('  comida  '),
    )
    expect(colorForCategoryName('Comida')).toBe(colorForCategoryName('COMIDA'))
  })

  it('only returns colors from the palette', () => {
    const names = [
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
      'Regalos',
      'Mascotas',
    ]
    for (const name of names) {
      expect(CATEGORY_COLOR_PALETTE).toContain(colorForCategoryName(name))
    }
  })

  it('distributes different names across more than one color', () => {
    const names = [
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
      'Regalos',
      'Mascotas',
      'Educacion',
      'Viajes',
    ]
    const colors = new Set(names.map((name) => colorForCategoryName(name)))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('returns a defined palette color for an empty string without crashing', () => {
    const color = colorForCategoryName('')
    expect(CATEGORY_COLOR_PALETTE).toContain(color)
  })

  it('treats a whitespace-only name the same as an empty name', () => {
    expect(colorForCategoryName('   ')).toBe(colorForCategoryName(''))
  })

  it('handles unicode category names deterministically', () => {
    expect(colorForCategoryName('café ☕ 日本語')).toBe(
      colorForCategoryName('café ☕ 日本語'),
    )
    expect(CATEGORY_COLOR_PALETTE).toContain(
      colorForCategoryName('café ☕ 日本語'),
    )
  })

  it('handles a very long category name deterministically without crashing', () => {
    const longName = 'a'.repeat(10_000)
    const color = colorForCategoryName(longName)
    expect(CATEGORY_COLOR_PALETTE).toContain(color)
    expect(colorForCategoryName(longName)).toBe(color)
  })
})

describe('CATEGORY_COLOR_PALETTE', () => {
  // Grown from twelve per direct feedback: a real household reached fifteen
  // categories, and with only twelve swatches five pairs of them collided.
  it('carries at least one swatch per category a real household reaches', () => {
    expect(CATEGORY_COLOR_PALETTE.length).toBeGreaterThanOrEqual(20)
  })

  it('has no duplicate swatches', () => {
    expect(new Set(CATEGORY_COLOR_PALETTE).size).toBe(
      CATEGORY_COLOR_PALETTE.length,
    )
  })

  it('is every entry a 6-digit hex color', () => {
    for (const color of CATEGORY_COLOR_PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})

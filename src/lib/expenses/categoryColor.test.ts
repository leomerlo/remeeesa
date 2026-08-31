import { describe, expect, it } from 'vitest'
import { CATEGORY_COLOR_PALETTE, colorForCategoryName } from './categoryColor'

describe('colorForCategoryName', () => {
  it('returns the same color for the same name', () => {
    expect(colorForCategoryName('Comida')).toBe(colorForCategoryName('Comida'))
  })

  it('is case and whitespace insensitive, matching categoryDocumentId normalization', () => {
    expect(colorForCategoryName('Comida')).toBe(colorForCategoryName('  comida  '))
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

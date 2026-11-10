import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLOR_PALETTE,
  colorForCategoryName,
  inkForCategoryColor,
  nextCategoryColor,
} from './categoryColor'
import { contrastRatio } from '@/lib/a11y/contrast'

// CIE76. Good enough for "would anyone confuse these two at a glance", which
// is the only question this file asks of a colour.
function deltaE(left: string, right: string): number {
  const toLab = (hex: string): readonly [number, number, number] => {
    const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
    const linear = channels.map((value) => {
      const c = value / 255
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }) as [number, number, number]
    const [r, g, b] = linear
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    const f = (t: number): number =>
      t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
  }
  const a = toLab(left)
  const b = toLab(right)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

describe('the category palette', () => {
  // The whole point of a category colour. The palette this replaced had four
  // violets a household could not tell apart in its own donut.
  it('has no two swatches anyone could confuse', () => {
    let closest = { distance: Infinity, pair: ['', ''] }
    for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i += 1) {
      for (let j = i + 1; j < CATEGORY_COLOR_PALETTE.length; j += 1) {
        const left = CATEGORY_COLOR_PALETTE[i] as string
        const right = CATEGORY_COLOR_PALETTE[j] as string
        const distance = deltaE(left, right)
        if (distance < closest.distance) {
          closest = { distance, pair: [left, right] }
        }
      }
    }
    expect(
      closest.distance,
      `${closest.pair[0] ?? ''} and ${closest.pair[1] ?? ''} are too close`,
    ).toBeGreaterThanOrEqual(25)
  })

  // Assignment walks forward from a free slot, so entries that sit near each
  // other in the list end up near each other on screen. Generated in hue
  // order, that gave a household five greens in a row.
  it('keeps nearby entries far apart, not just distant ones', () => {
    const WINDOW = 4
    let closest = Infinity
    for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i += 1) {
      for (let step = 1; step <= WINDOW; step += 1) {
        const j = (i + step) % CATEGORY_COLOR_PALETTE.length
        closest = Math.min(
          closest,
          deltaE(
            CATEGORY_COLOR_PALETTE[i] as string,
            CATEGORY_COLOR_PALETTE[j] as string,
          ),
        )
      }
    }
    expect(closest).toBeGreaterThanOrEqual(30)
  })

  it('has no duplicates', () => {
    expect(new Set(CATEGORY_COLOR_PALETTE).size).toBe(
      CATEGORY_COLOR_PALETTE.length,
    )
  })

  // Every swatch is a disc with an icon on it, so every swatch has to be able
  // to carry one. 3:1 is what WCAG 1.4.11 asks of a graphic.
  it('carries its own ink on every swatch', () => {
    for (const color of CATEGORY_COLOR_PALETTE) {
      expect(
        contrastRatio(inkForCategoryColor(color), color),
        `${color} cannot carry an icon`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  // One ink for the whole palette. Half of it used to need a near-black
  // icon, which made a list of categories read as two different things --
  // per direct feedback. Keeping every swatch dark enough for white is what
  // this asserts; a new swatch that is too light fails here rather than
  // quietly getting a black icon in a sea of white ones.
  it('carries a white icon on every swatch', () => {
    for (const color of CATEGORY_COLOR_PALETTE) {
      expect(
        inkForCategoryColor(color),
        `${color} is too light for a white icon`,
      ).toBe('#ffffff')
      expect(contrastRatio('#ffffff', color)).toBeGreaterThanOrEqual(3)
    }
  })

  it('still flips to dark ink for a colour outside the palette', () => {
    expect(inkForCategoryColor('#ffe9a8')).toBe('#1d1c20')
  })
})

describe('nextCategoryColor', () => {
  // The bug this exists for: hashing the name alone put four of one
  // household's categories on the same violet, because a hash into twenty
  // buckets collides long before the buckets run out.
  it('never repeats a colour the household already uses', () => {
    const names = [
      'Casa',
      'Comida',
      'Entretenimiento',
      'Mascotas',
      'Ocio',
      'Otros',
      'Ropa',
      'Salud',
      'Servicios',
      'Tarjeta',
      'Transporte',
    ]
    const taken: string[] = []
    for (const name of names) {
      taken.push(nextCategoryColor(name, taken))
    }

    expect(new Set(taken).size).toBe(names.length)
  })

  it('fills the whole palette before it has to repeat', () => {
    const taken: string[] = []
    for (let i = 0; i < CATEGORY_COLOR_PALETTE.length; i += 1) {
      taken.push(nextCategoryColor(`Categoría ${String(i)}`, taken))
    }

    expect(new Set(taken).size).toBe(CATEGORY_COLOR_PALETTE.length)
  })

  it('still gives the name its own colour when nothing is taken', () => {
    expect(nextCategoryColor('Comida', [])).toBe(colorForCategoryName('Comida'))
  })

  it('repeats only once there is nothing free left', () => {
    const everything = [...CATEGORY_COLOR_PALETTE]

    expect(CATEGORY_COLOR_PALETTE).toContain(
      nextCategoryColor('Una más', everything),
    )
  })

  it('ignores the case a stored colour happens to be written in', () => {
    const first = nextCategoryColor('Comida', [])

    expect(nextCategoryColor('Comida', [first.toUpperCase()])).not.toBe(first)
  })
})

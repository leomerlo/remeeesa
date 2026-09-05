import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUDGET_GRADIENT_CALM } from '@/lib/expenses'
import { contrastRatio } from './contrast'

// Guards the two accessibility rules this app committed to, per direct
// feedback ("tamaño mínimo de tipografía 14px", "todo tiene que pasar
// contrastes AA"). Both are properties of the token file and of how
// components spend it, so both are checkable here rather than by eye on
// every future change.

// Read off disk rather than imported: Vitest stubs a CSS import to an empty
// module, `?raw` included, so an import would silently assert nothing.
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

const AA_TEXT = 4.5 // WCAG 1.4.3, normal-size text
const AA_NON_TEXT = 3 // WCAG 1.4.11, UI components and meaningful graphics
const MIN_FONT_PX = 14

// The file declares the light theme at :root and the dark one inside a
// [data-theme='dark'] block. Splitting on that block keeps a dark-only
// override from shadowing the light value of the same name.
const darkStart = css.indexOf("[data-theme='dark'] {")
const lightSource = css.slice(0, darkStart)
const darkSource = css.slice(0, darkStart) + css.slice(darkStart)

function declarations(source: string): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  for (const [, name, value] of source.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;]+);/g,
  )) {
    found.set(name, value.trim())
  }
  return found
}

function resolve(name: string, source: string): string {
  const table = declarations(source)
  let value = table.get(name)
  expect(value, `${name} is not declared in src/index.css`).toBeDefined()
  // Aliases chain (semantic -> primitive), so follow them to a literal.
  for (let hops = 0; hops < 10 && value !== undefined; hops += 1) {
    const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value)
    if (alias === null) {
      return value
    }
    value = table.get(alias[1] as string)
  }
  throw new Error(`Could not resolve ${name} to a literal colour`)
}

const light = (name: string): string => resolve(name, lightSource)
const dark = (name: string): string => resolve(name, darkSource)

describe('colour tokens meet WCAG AA', () => {
  // Every pair below is one that actually occurs on screen. A token that no
  // component puts on that background is not listed -- the point is the real
  // combinations, not a full cross-product.
  const textPairs = [
    ['muted text on a card', '--text-tertiary', '--surface-card'],
    ['muted text on the page', '--text-tertiary', '--surface-page'],
    ['muted text on a muted pill', '--text-tertiary', '--surface-secondary'],
    ['body text on a card', '--text-primary', '--surface-card'],
    ['body text on the page', '--text-primary', '--surface-page'],
    ['secondary text on a card', '--text-secondary', '--surface-card'],
    ['link text on a card', '--text-action', '--surface-card'],
    ['link text on the page', '--text-action', '--surface-page'],
    [
      'link text on its own subtle pill',
      '--text-action',
      '--surface-action-subtle',
    ],
    ['button label on the button', '--text-on-action', '--surface-action'],
    [
      'button label on a hovered button',
      '--text-on-action',
      '--surface-action-hover',
    ],
    // The budget hero is a gradient with white text across the whole span,
    // so both ends have to hold it, not just the one the label starts on.
    ['hero text on the gradient start', '--text-on-action', '--surface-action'],
    [
      'hero text on the gradient end',
      '--text-on-action',
      '--surface-action-gradient-end',
    ],
    ['error text on a card', '--text-error', '--surface-card'],
    ['error text on its own surface', '--text-error', '--surface-error'],
    ['warning text on a card', '--text-warning', '--surface-card'],
    ['success text on its own surface', '--text-success', '--surface-success'],
  ] as const

  for (const [what, fg, bg] of textPairs) {
    it(`light: ${what}`, () => {
      expect(contrastRatio(light(fg), light(bg))).toBeGreaterThanOrEqual(
        AA_TEXT,
      )
    })
    it(`dark: ${what}`, () => {
      expect(contrastRatio(dark(fg), dark(bg))).toBeGreaterThanOrEqual(AA_TEXT)
    })
  }

  const nonTextPairs = [
    ['input outline against a card', '--border-primary', '--surface-card'],
    ['input outline against the page', '--border-primary', '--surface-page'],
    ['focus ring against the page', '--border-focus', '--surface-page'],
    ['focus ring against a card', '--border-focus', '--surface-card'],
    // The paid/pending dots under "Gastos de este mes" -- they are what tells
    // the two figures apart at a glance, so they carry meaning.
    ['paid dot on a card', '--text-success', '--surface-card'],
    ['pending dot on a card', '--text-warning', '--surface-card'],
  ] as const

  for (const [what, fg, bg] of nonTextPairs) {
    it(`light: ${what}`, () => {
      expect(contrastRatio(light(fg), light(bg))).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      )
    })
    it(`dark: ${what}`, () => {
      expect(contrastRatio(dark(fg), dark(bg))).toBeGreaterThanOrEqual(
        AA_NON_TEXT,
      )
    })
  }
})

describe('the budget card keeps its colours in step with the tokens', () => {
  // The hero card computes its gradient in TS (it interpolates toward red
  // as the budget runs out), so its calm end is a second copy of two token
  // values. This is what stops that copy drifting from the real ones.
  it('starts from exactly the action tokens the rest of the app uses', () => {
    expect(BUDGET_GRADIENT_CALM.from).toBe(light('--surface-action'))
    expect(BUDGET_GRADIENT_CALM.to).toBe(light('--surface-action-gradient-end'))
  })
})

describe('nothing renders below 14px', () => {
  const remToPx = (value: string): number | null => {
    const rem = /^([\d.]+)rem$/.exec(value.trim())
    if (rem !== null) {
      return Number(rem[1]) * 16
    }
    const px = /^([\d.]+)px$/.exec(value.trim())
    return px === null ? null : Number(px[1])
  }

  it('every font-size token in the scale is at least 14px', () => {
    const sizes = [...declarations(css).entries()].filter(
      ([name]) => /^--text-[a-z0-9-]+$/.test(name) && !name.endsWith('height'),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const [name, value] of sizes) {
      const px = remToPx(value)
      if (px === null) {
        continue // a colour role such as --text-primary, not a size
      }
      expect(px, `${name} is ${String(px)}px`).toBeGreaterThanOrEqual(
        MIN_FONT_PX,
      )
    }
  })

  it('no component sets an arbitrary font size below 14px', () => {
    // Tailwind's arbitrary-value syntax is the one way around the scale, so
    // it is checked against the source of every component rather than
    // against the token file.
    const sources = import.meta.glob('/src/**/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>
    const offenders: string[] = []
    for (const [path, source] of Object.entries(sources)) {
      if (/\.test\.tsx$/.test(path)) {
        continue
      }
      for (const [, size, unit] of source.matchAll(
        /text-\[([\d.]+)(px|rem)\]/g,
      )) {
        const px = unit === 'rem' ? Number(size) * 16 : Number(size)
        if (px < MIN_FONT_PX) {
          offenders.push(`${path}: text-[${String(size)}${String(unit)}]`)
        }
      }
    }
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })
})

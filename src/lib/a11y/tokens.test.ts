import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { budgetTone, budgetToneClass } from '@/lib/expenses'
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
    ['hero text on the budget card', '--text-on-action', '--surface-action'],
    // "Vencimientos que se acercan" is white on a flat fill of the danger
    // colour, and so is the budget card once the month is spent.
    ['due-soon text on its card', '--text-on-error', '--surface-due-soon'],
    // The nav is its own dark surface at every width, so its text is read
    // against that rather than against the page.
    ['nav label on the nav', '--text-nav', '--surface-nav'],
    [
      'the current destination on the nav',
      '--text-nav-active',
      '--surface-nav',
    ],
    ['error text on a card', '--text-error', '--surface-card'],
    [
      'destructive label on its button',
      '--text-on-error',
      '--surface-error-strong',
    ],
    [
      'destructive label on a hovered button',
      '--text-on-error',
      '--surface-error-strong-hover',
    ],
    [
      'soft destructive label on its chip',
      '--text-error',
      '--surface-error-hover',
    ],
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

  // A gradient card is only as readable as its *lightest* point. Checking
  // the fill as a whole is not possible -- it is not one colour -- so both
  // stops are checked, and the light one is the one that can fail. This is
  // why these four sit deeper than the gradients they were taken from: a
  // card you can only read at the bottom is not a card you can read.
  const statGradients = [
    ['violeta (neutral)', '--stat-violet-from', '--stat-violet-to'],
    ['celeste (ok)', '--stat-sky-from', '--stat-sky-to'],
    ['fucsia (getting tight)', '--stat-pink-from', '--stat-pink-to'],
    ['rojo (at the limit)', '--stat-red-from', '--stat-red-to'],
  ] as const

  for (const [what, from, to] of statGradients) {
    for (const [theme, read] of [
      ['light', light],
      ['dark', dark],
    ] as const) {
      it(`${theme}: white on the ${what} card, at both ends`, () => {
        const ink = read('--text-on-stat')
        expect(contrastRatio(ink, read(from))).toBeGreaterThanOrEqual(AA_TEXT)
        expect(contrastRatio(ink, read(to))).toBeGreaterThanOrEqual(AA_TEXT)
      })
    }
  }

  const nonTextPairs = [
    ['input outline against a card', '--border-primary', '--surface-card'],
    ['input outline against the page', '--border-primary', '--surface-page'],
    ['focus ring against the page', '--border-focus', '--surface-page'],
    ['focus ring against a card', '--border-focus', '--surface-card'],
    // The paid/pending dots under "Gastos del mes" -- they are what tells
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
  // The hero card picks its fill in TS, by name, so the names it picks are
  // a second copy of something that lives in the stylesheet. This is what
  // stops a renamed token leaving the card with no background at all --
  // which would fail silently, since a missing gradient utility renders as
  // nothing rather than as an error.
  it('only ever names gradients the stylesheet actually declares', () => {
    for (const percent of [0, 50, 75, 95, 140]) {
      const [background] = budgetToneClass(budgetTone(percent)).split(' ')
      const hue = background?.replace('bg-stat-', '')
      expect(
        declarations(lightSource).has(`--stat-${String(hue)}-from`),
        `${String(background)} has no --stat-${String(hue)}-from token`,
      ).toBe(true)
    }
  })

  // Every colour the card can land on is one of the four that were checked
  // for white at both stops above; this is what keeps the card inside that
  // set rather than reaching for a fifth hue nobody measured.
  it('only ever lands on one of the four measured cards', () => {
    const measured = ['violet', 'sky', 'pink', 'red']
    for (const percent of [0, 50, 75, 95, 140]) {
      const [background] = budgetToneClass(budgetTone(percent)).split(' ')
      expect(measured).toContain(background?.replace('bg-stat-', ''))
    }
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

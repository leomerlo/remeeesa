import { contrastRatio } from '@/lib/a11y/contrast'

// A category's colour is chosen by the household, so it can be anything on
// the palette -- a pale yellow or a near-black navy. Printing the category
// name *in* that colour would be unreadable for half of them, and printing
// it on a tinted chip of it would be worse. So both the chip and the text on
// it are derived from the colour here, and the text is darkened until it
// actually clears AA against the chip it sits on. Per direct feedback: a
// light badge in the category's own colour, with text that always passes.
//
// categoryBadge.test.ts runs this over every colour in the palette (and a
// few deliberately awful ones) and asserts the pair every time, so a new
// swatch cannot quietly ship an unreadable badge.

const AA_TEXT = 4.5
const TINT = 0.14 // how much of the colour survives in the chip

function parse(hex: string): readonly [number, number, number] {
  const digits = hex.replace('#', '')
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits
  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ]
}

function toHex(channels: readonly number[]): string {
  return `#${channels
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function mix(from: string, to: string, amount: number): string {
  const a = parse(from)
  const b = parse(to)
  return toHex(
    a.map((channel, i) => channel + ((b[i] ?? 0) - channel) * amount),
  )
}

export type CategoryBadgeColors = {
  readonly background: string
  readonly foreground: string
}

export function categoryBadgeColors(color: string): CategoryBadgeColors {
  const background = mix('#ffffff', color, TINT)
  // Walk the colour toward black until it clears AA on its own chip.
  // Mixing toward black scales the channels, so the hue is kept and only
  // the lightness moves -- the badge still reads as *this* category's
  // colour, just dark enough to read. Black itself always clears it, so
  // this cannot fall through without an answer.
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mix(color, '#000000', step / 20)
    if (contrastRatio(candidate, background) >= AA_TEXT) {
      return { background, foreground: candidate }
    }
  }
  return { background, foreground: '#000000' }
}

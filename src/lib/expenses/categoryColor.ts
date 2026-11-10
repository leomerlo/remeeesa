import { relativeLuminance } from '@/lib/a11y/contrast'

// Twenty swatches, built as two laps around the colour wheel rather than
// picked by hand. The hand-picked list this replaced had drifted into four
// near-identical violets and a pair of teals nobody could tell apart, which
// is exactly the thing a category colour exists to prevent.
//
// Lap one is ten hues, evenly spaced *perceptually* (in CIE Lab, not HSL --
// even steps in HSL crowd the greens and stretch the blues, which is how the
// old list ended up with its violets). Lap two is the same ten hues offset
// by half a step and lighter, so it interleaves between lap one rather than
// repeating it: no two swatches in the whole set share a hue. Each is as
// saturated as sRGB allows at its own lightness.
//
// Both laps are held under the lightness at which a white icon stops
// working (3:1, what WCAG asks of a graphic). An earlier lap two sat well
// above it, so half the discs had to carry a near-black icon and a list of
// categories read as two different things. Darkening that lap is what buys
// one ink for all twenty. Per direct feedback.
//
// The closest pair in the whole set is 26.7 ΔE apart (CIE76) -- past the
// ~25 at which two colours stop being tellable apart side by side.
//
// The *order* is not the order they were generated in. Categories are
// assigned by walking forward from a free slot, so neighbours in this list
// become neighbours on screen -- and generated in hue order, that handed a
// household five greens in a row. Shuffled so that any two entries within
// four places of each other are at least 33 ΔE apart, which is what keeps a
// run of newly-created categories looking like a palette rather than a ramp.
//
// categoryColor.test.ts asserts both floors, so neither a swatch nor the
// order can be edited into something that collides.
export const CATEGORY_COLOR_PALETTE = [
  '#9c9600', // oliva claro
  '#5a8eff', // azul claro
  '#00a77c', // turquesa claro
  '#00607d', // petróleo
  '#953d00', // ocre
  '#b30046', // rojo
  '#b975e6', // violeta claro
  '#006731', // verde
  '#009be3', // celeste
  '#00a2b1', // turquesa
  '#284dc3', // violeta
  '#f359a3', // rosa
  '#486000', // oliva
  '#ce8118', // ámbar
  '#f46355', // salmón
  '#0059a5', // azul
  '#006459', // esmeralda
  '#a10e8c', // magenta
  '#715400', // mostaza
  '#53a436', // lima
] as const

// Which ink reads on a swatch. Every colour in the palette above is white
// today -- that is the point of holding both laps under this threshold, and
// categoryColor.test.ts asserts it, so no swatch can be added that breaks
// it. The dark branch is the safety net for a colour from outside the
// palette: a household's own pick, if that ever becomes a thing.
//
// 0.30 is the luminance at which white drops below the 3:1 WCAG asks of a
// graphic. It was 0.42, which let through ten swatches a white icon was
// barely visible on (2.1:1) -- hence the near-black ink on half the list.
export function inkForCategoryColor(color: string): string {
  return relativeLuminance(color) > 0.3 ? '#1d1c20' : '#ffffff'
}

function hashCategoryName(name: string): number {
  const normalized = name.trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 2147483647
  }
  return hash
}

// The colour a name hashes to, with nothing else taken. Still used wherever
// a colour is needed for something that was never stored with one -- a
// member avatar, a category that has gone missing -- and as the starting
// point for nextCategoryColor below.
export function colorForCategoryName(name: string): string {
  return CATEGORY_COLOR_PALETTE[
    hashCategoryName(name) % CATEGORY_COLOR_PALETTE.length
  ] as string
}

// The colour to give a *new* category, given the ones the household is
// already using.
//
// Hashing the name alone is what put four categories on the same violet: a
// hash into twenty buckets collides long before the buckets run out -- with
// eleven categories it is more likely than not, and the household sees two
// identical dots and a donut with two identical slices. Starting from the
// hash keeps a given name landing on the same colour when it can, and
// walking forward from there means a free colour is always preferred to a
// taken one. Only past twenty categories does it have to repeat.
export function nextCategoryColor(
  name: string,
  taken: readonly string[],
): string {
  const used = new Set(taken.map((color) => color.trim().toLowerCase()))
  const start = hashCategoryName(name) % CATEGORY_COLOR_PALETTE.length
  for (let step = 0; step < CATEGORY_COLOR_PALETTE.length; step += 1) {
    const candidate = CATEGORY_COLOR_PALETTE[
      (start + step) % CATEGORY_COLOR_PALETTE.length
    ] as string
    if (!used.has(candidate.toLowerCase())) {
      return candidate
    }
  }
  return CATEGORY_COLOR_PALETTE[start] as string
}

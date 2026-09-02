// Values are copied from the design tokens in src/index.css where a token
// exists (magenta and the stronger yellow/green don't have their own scale
// yet, so those three are hand-picked hex values instead). Twelve visually
// distinct swatches -- the approved Home comp already relied on eight
// genuinely different hues side by side, and two steps of the same hue read
// as "the same category" at a glance, which defeats the point of
// color-coding. Keep this list in sync with src/index.css if the tokens are
// ever regenerated.
//
// Order matters: CategoryColorPicker renders these in array order, so it's
// deliberately interleaved (violet, then teal, then orange...) rather than
// grouped by hue -- otherwise same-family swatches (the two violets, the two
// yellows, the two greens, magenta next to pink) would sit side by side and
// be hard to tell apart at a glance. Preserve that spread if this list is
// ever reordered or extended.
export const CATEGORY_COLOR_PALETTE = [
  '#7b5cfa', // purple-400
  '#df473c', // red-400 (coral)
  '#5bb9b6', // teal-400
  '#f2a25c', // orange-400
  '#5394c7', // blue-400
  '#f6a925', // yellow-400
  '#59c07f', // green-400
  '#c2138f', // magenta
  '#eab308', // yellow, stronger/more saturated than yellow-400
  '#2c06c6', // purple-600
  '#16a34a', // green, distinct from the softer green-400
  '#f472b6', // pink-400
] as const

function hashCategoryName(name: string): number {
  const normalized = name.trim().toLowerCase()
  let hash = 0
  for (let i = 0; i < normalized.length; i += 1) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 2147483647
  }
  return hash
}

export function colorForCategoryName(name: string): string {
  return CATEGORY_COLOR_PALETTE[
    hashCategoryName(name) % CATEGORY_COLOR_PALETTE.length
  ]
}

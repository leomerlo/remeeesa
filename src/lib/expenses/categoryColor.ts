// Values are copied from the design tokens in src/index.css where a token
// exists (magenta and the stronger yellow/green don't have their own scale
// yet, so those are hand-picked hex values instead). Twenty visually
// distinct swatches -- the approved Home comp already relied on eight
// genuinely different hues side by side, and two steps of the same hue read
// as "the same category" at a glance, which defeats the point of
// color-coding. Grown from twelve per direct feedback: a real household hit
// fifteen categories and five pairs of them collided on the same swatch.
// Keep this list in sync with src/index.css if the tokens are ever
// regenerated.
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
  '#0ea5e9', // sky -- brighter and cooler than blue-400
  '#a16207', // brown/dark amber -- reads as its own hue next to the yellows
  '#84cc16', // lime -- yellow-green, clear of both greens
  '#e11d48', // rose -- pink-leaning red, clear of the orange-leaning coral
  '#0f766e', // deep teal -- much darker than teal-400
  '#64748b', // slate -- the one neutral, for a category that wants no hue
  '#d946ef', // fuchsia -- brighter than magenta, cooler than pink
  '#1e40af', // navy -- deep blue, clear of both violets
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

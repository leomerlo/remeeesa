// Values are copied from the design tokens in src/index.css. Eight visually
// distinct hues (one step each) rather than four hues at two steps -- the
// approved Home comp uses this many genuinely different category colors
// (coral, teal, yellow, purple, orange, green, blue) side by side in one
// screen, and two steps of the same hue read as "the same category" at a
// glance, which defeats the point of color-coding. Keep this list in sync
// with src/index.css if the tokens are ever regenerated.
export const CATEGORY_COLOR_PALETTE = [
  '#7b5cfa', // purple-400
  '#df473c', // red-400 (coral)
  '#5bb9b6', // teal-400
  '#f6a925', // yellow-400
  '#f2a25c', // orange-400
  '#59c07f', // green-400
  '#5394c7', // blue-400
  '#2c06c6', // purple-600
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

// Values are copied from the design tokens in src/index.css (purple/green/red/yellow
// 400 and 600 steps). Keep these two lists in sync if the tokens are ever regenerated.
export const CATEGORY_COLOR_PALETTE = [
  '#7b5cfa', '#2c06c6', // purple-400, purple-600
  '#59c07f', '#3fa665', // green-400, green-600
  '#df473c', '#ad261c', // red-400, red-600
  '#f6a925', '#c27d08', // yellow-400, yellow-600
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
  return CATEGORY_COLOR_PALETTE[hashCategoryName(name) % CATEGORY_COLOR_PALETTE.length]
}

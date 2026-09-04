import { CATEGORY_COLOR_PALETTE } from './categoryColor'

export function parseCategoryName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre de la categoría no puede estar vacío')
  }
  return trimmed
}

// Colors are picked, never typed: a category's color is only ever one of the
// eight palette swatches, so anything else is a bug or a hand-rolled write.
// Checked here as well as in the Firestore rule, because the rule can only say
// "looks like a hex color" -- it has no way to hold the palette.
export function parseCategoryColor(color: string): string {
  const normalized = color.trim().toLowerCase()
  if (!(CATEGORY_COLOR_PALETTE as readonly string[]).includes(normalized)) {
    throw new Error('El color de la categoría no es uno de los disponibles')
  }
  return normalized
}

export function parseExpenseName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del gasto no puede estar vacío')
  }
  return trimmed
}

export function parseExpensePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('El precio del gasto debe ser un número positivo')
  }
  const rounded = Math.round(price * 100) / 100
  if (rounded <= 0) {
    throw new Error('El precio del gasto debe ser un número positivo')
  }
  return rounded
}

export function parseAuthorDisplayName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del autor no puede estar vacío')
  }
  return trimmed
}

export function parseExpenseDate(expenseDate: Date, now = new Date()): Date {
  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error('La fecha del gasto no es válida')
  }
  const expenseDay =
    expenseDate.getFullYear() * 10000 +
    (expenseDate.getMonth() + 1) * 100 +
    expenseDate.getDate()
  const today =
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  if (expenseDay > today) {
    throw new Error('La fecha del gasto no puede ser futura')
  }
  return expenseDate
}

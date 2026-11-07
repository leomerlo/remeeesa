import { PAYMENT_METHOD_KINDS } from '@/lib/cards'
import type { PaymentMethodKind } from '@/lib/cards'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import type { Category } from '@/lib/expenses'

export const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

export function monthName(date: Date): string {
  return MONTHS[date.getMonth()] ?? ''
}

// A category is a solid disc of its own colour with a white icon, the way
// the v1 draws it. The palette holds every swatch under the lightness where
// white stops clearing 3:1, which is what buys one ink for all twenty.
export function categoryMark(
  categories: readonly Category[],
  categoryId: string,
): { readonly name: string; readonly color: string } {
  const found = categories.find((category) => category.id === categoryId)
  return {
    name: found?.name ?? 'Sin categoría',
    color: found?.color ?? '#6b7280',
  }
}

// Thousands by dot, decimals by comma -- the way a number is written here,
// and the way every other figure in the app is already written. For a
// number shown bare rather than as money, so it carries no "$" of its own.
const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

export function formatPesos(value: number): string {
  return Number.isFinite(value) ? PESOS.format(value) : ''
}

// Only the digits of whatever was typed, which is what a rate is.
export function digitsOf(text: string): number {
  return Number(text.replace(/[^0-9]/gu, ''))
}

// An amount somebody typed, read the way they meant it: here a comma is
// the decimal point and a dot separates thousands, so "1.500,50" is one
// thousand five hundred and a half, not one and a half.
export function parseTyped(text: string): number {
  const parsed = Number(text.replace(/[.]/gu, '').replace(/[,]/gu, '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export { iconForCategoryName }

// What a payment method is, in one word, for the line under its name.
// Cash gets nothing: "Efectivo" already says it.
export function kindOf(kind: PaymentMethodKind): string {
  return PAYMENT_METHOD_KINDS.find((one) => one.value === kind)?.label ?? ''
}

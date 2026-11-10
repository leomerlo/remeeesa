import { PAYMENT_METHOD_KINDS } from '@/lib/cards'
import type { PaymentMethodKind } from '@/lib/cards'
import {
  formatAmount as plainAmount,
  formatCompactCurrency as plainCompact,
  formatCurrency as plainCurrency,
} from '@/lib/expenses'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import type { Category } from '@/lib/expenses'
import type { Currency } from '@/lib/money'

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

// Money, with a space between the sign and the figure.
//
// "$362.300" packs the two together and the eye reads one token; "$ 362.300"
// is a sign and an amount, which is what it is. It matters most where the
// sign is not "$": "US$1.010,28" is four characters of prefix with nothing
// to separate them from the number.
//
// A non-breaking space, so a figure never wraps between its sign and its
// digits at the end of a line.
//
// Wrapped here rather than changed in @/lib/expenses, because that one is
// the v1's too and the v1 is not asking for this.
const SIGN = /^(-?)(US\$|\$)/u

function spaced(text: string): string {
  return text.replace(
    SIGN,
    (_whole, sign: string, mark: string) => `${sign}${mark}\u00a0`,
  )
}

export function formatCurrency(amount: number): string {
  return spaced(plainCurrency(amount))
}

export function formatAmount(amount: number, currency: Currency): string {
  return spaced(plainAmount(amount, currency))
}

export function formatCompactCurrency(amount: number): string {
  return spaced(plainCompact(amount))
}

export function formatPesos(value: number): string {
  return Number.isFinite(value) ? PESOS.format(value) : ''
}

// Only the digits of whatever was typed, which is what a rate is.
export function digitsOf(text: string): number {
  return Number(text.replace(/[^0-9]/gu, ''))
}

export { iconForCategoryName }

// What a payment method is, in one word, for the line under its name.
// Cash gets nothing: "Efectivo" already says it.
export function kindOf(kind: PaymentMethodKind): string {
  return PAYMENT_METHOD_KINDS.find((one) => one.value === kind)?.label ?? ''
}

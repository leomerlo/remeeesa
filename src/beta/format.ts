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

export { iconForCategoryName }

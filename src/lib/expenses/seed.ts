import { nextCategoryColor } from './categoryColor'
import type { Category } from './types'

export const DEFAULT_CATEGORY_NAMES = [
  'Comida',
  'Transporte',
  'Servicios',
  'Entretenimiento',
  'Salud',
  'Otros',
] as const

export function categoryDocumentId(input: {
  readonly householdId: string
  readonly name: string
}): string {
  return `${input.householdId}_${encodeURIComponent(input.name.trim().toLowerCase())}`
}

export function defaultCategoryRecords(input: {
  readonly householdId: string
  readonly createdAt: Date
}): readonly Category[] {
  // Assigned in one pass, each one told what the ones before it took, so a
  // brand-new household never opens with two identical dots.
  const taken: string[] = []
  return DEFAULT_CATEGORY_NAMES.map((name) => {
    const color = nextCategoryColor(name, taken)
    taken.push(color)
    return {
      id: categoryDocumentId({ householdId: input.householdId, name }),
      householdId: input.householdId,
      name,
      color,
      monthlyBudget: 0,
      createdAt: input.createdAt,
    }
  })
}

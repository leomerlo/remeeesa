import { colorForCategoryName } from './categoryColor'
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
  return DEFAULT_CATEGORY_NAMES.map((name) => ({
    id: categoryDocumentId({ householdId: input.householdId, name }),
    householdId: input.householdId,
    name,
    color: colorForCategoryName(name),
    createdAt: input.createdAt,
  }))
}

import { nextCategoryColor } from './categoryColor'
import type { Category } from './types'

// What a brand-new household starts with. Not a taxonomy -- it is the
// handful of cajones that almost every household turns out to need, so
// that the first gasto has somewhere to go and the list is not a blank
// page. Everything else gets made as it comes up, from the form itself.
//
// "Casa" and "Auto" were added because every real household here has
// both and was making them by hand on day one. "Supermercado" stays
// inside Comida and "Compras" inside Otros on purpose: two cajones that
// overlap turn every gasto into a decision.
export const DEFAULT_CATEGORY_NAMES = [
  'Comida',
  'Casa',
  'Transporte',
  'Auto',
  'Servicios',
  'Entretenimiento',
  'Salud',
  // The card's own category. The app used to make it the first time a
  // household logged something on credit, which meant it appeared out of
  // nowhere halfway through a month; it is one of the cajones a
  // household here has from the start. Its figure stays at zero: what
  // goes on a card counts in the category it was bought for, and this
  // one holds the Resúmenes.
  'Tarjetas de Crédito',
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

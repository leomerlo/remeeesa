import type { HouseholdsDb } from '@/lib/households/types'
import type { Category } from './types'
import { parseCategoryColor, parseCategoryName } from './validate'

// Rename refuses a name another category already holds, because the two would
// land on the same document id. The user's way out is merge, so the error says
// so rather than leaving them to guess.
export class CategoryNameTakenError extends Error {
  override readonly name = 'CategoryNameTakenError'
  readonly code = 'CATEGORY_NAME_TAKEN'

  constructor() {
    super('Ya existe una categoría con ese nombre. Uní las dos en su lugar.')
  }
}

// Deleting a referenced category would orphan every Expense and Pendiente
// pointing at it -- they would render with no name and no color. Merge is the
// operation that actually gets rid of a category that is still in use.
export class CategoryInUseError extends Error {
  override readonly name = 'CategoryInUseError'
  readonly code = 'CATEGORY_IN_USE'

  constructor() {
    super(
      'La categoría tiene gastos o pendientes. Uníla con otra en vez de borrarla.',
    )
  }
}

export class CategoryNotFoundError extends Error {
  override readonly name = 'CategoryNotFoundError'
  readonly code = 'CATEGORY_NOT_FOUND'

  constructor() {
    super('Category not found')
  }
}

export async function updateCategoryColor(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly color: string
}): Promise<Category> {
  return input.db.updateCategoryColor({
    householdId: input.householdId,
    categoryId: input.categoryId,
    color: parseCategoryColor(input.color),
  })
}

export async function renameCategory(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
}): Promise<Category> {
  return input.db.renameCategory({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parseCategoryName(input.name),
  })
}

export async function deleteCategory(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
}): Promise<void> {
  return input.db.deleteCategory({
    householdId: input.householdId,
    categoryId: input.categoryId,
  })
}

export async function mergeCategories(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly sourceCategoryId: string
  readonly survivorCategoryId: string
}): Promise<void> {
  return input.db.mergeCategories({
    householdId: input.householdId,
    sourceCategoryId: input.sourceCategoryId,
    survivorCategoryId: input.survivorCategoryId,
  })
}

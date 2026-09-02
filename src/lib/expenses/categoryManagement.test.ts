import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import type { Category } from './types'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { CATEGORY_COLOR_PALETTE } from './categoryColor'
import {
  CategoryInUseError,
  CategoryNameTakenError,
  deleteCategory,
  mergeCategories,
  renameCategory,
  updateCategoryColor,
} from './categoryManagement'
import { createCuenta } from '@/lib/cuentas/cuentas'
import { createExpense, listCategories } from './expenses'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const byName = new Map(
    categories.map((category) => [category.name, category]),
  )
  return { db, householdId: household.id, byName }
}

async function seedExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name?: string
}) {
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: input.name ?? 'Gasto',
    price: 10,
    comments: '',
    expenseDate: new Date(),
  })
}

function categoryOrThrow(
  byName: Map<string, Category>,
  name: string,
): Category {
  const category = byName.get(name)
  if (category === undefined) {
    throw new Error(`expected the seeded ${name} category`)
  }
  return category
}

describe('updateCategoryColor', () => {
  it('changes only the color, leaving id, name and createdAt alone', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const before = categoryOrThrow(byName, 'Comida')
    const nextColor =
      CATEGORY_COLOR_PALETTE.find((color) => color !== before.color) ?? ''

    const after = await updateCategoryColor({
      db,
      householdId,
      categoryId: before.id,
      color: nextColor,
    })

    expect(after.color).toBe(nextColor)
    expect(after).toMatchObject({
      id: before.id,
      name: 'Comida',
    })
    const reread = await listCategories({ db, householdId })
    expect(reread.find((c) => c.id === before.id)?.color).toBe(nextColor)
  })

  it('rejects a color outside the palette', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')

    await expect(
      updateCategoryColor({
        db,
        householdId,
        categoryId: comida.id,
        color: '#123456',
      }),
    ).rejects.toThrow('no es uno de los disponibles')

    const reread = await listCategories({ db, householdId })
    expect(reread.find((c) => c.id === comida.id)?.color).toBe(comida.color)
  })
})

describe('renameCategory', () => {
  it('keeps the color and carries existing expenses to the new name', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')
    const expense = await seedExpense({
      db,
      householdId,
      categoryId: comida.id,
    })

    const renamed = await renameCategory({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Comida y bebida',
    })

    expect(renamed.name).toBe('Comida y bebida')
    expect(renamed.color).toBe(comida.color)

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.name)).toContain('Comida y bebida')
    expect(categories.map((c) => c.name)).not.toContain('Comida')

    const moved = await db.getExpense({ householdId, expenseId: expense.id })
    expect(moved?.categoryId).toBe(renamed.id)
  })

  it('repoints Cuentas as well as Expenses', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')
    const cuenta = await createCuenta({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Verdulería',
      dueDate: new Date('2026-12-10T12:00:00'),
      expectedAmount: 500,
    })

    const renamed = await renameCategory({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Mercado',
    })

    const moved = await db.getCuenta({ householdId, cuentaId: cuenta.id })
    expect(moved?.categoryId).toBe(renamed.id)
  })

  it('refuses a name another category already holds, and writes nothing', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')
    const expense = await seedExpense({
      db,
      householdId,
      categoryId: comida.id,
    })

    await expect(
      // Case and whitespace are normalised into the doc id, so this collides
      // with the seeded "Transporte" even though it is typed differently.
      renameCategory({
        db,
        householdId,
        categoryId: comida.id,
        name: '  transporte ',
      }),
    ).rejects.toBeInstanceOf(CategoryNameTakenError)

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.name)).toContain('Comida')
    expect(categories.map((c) => c.name)).toContain('Transporte')
    const untouched = await db.getExpense({
      householdId,
      expenseId: expense.id,
    })
    expect(untouched?.categoryId).toBe(comida.id)
  })

  it('renames in place when only the casing changed', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')
    const expense = await seedExpense({
      db,
      householdId,
      categoryId: comida.id,
    })

    const renamed = await renameCategory({
      db,
      householdId,
      categoryId: comida.id,
      name: 'COMIDA',
    })

    expect(renamed.id).toBe(comida.id)
    expect(renamed.name).toBe('COMIDA')
    const kept = await db.getExpense({ householdId, expenseId: expense.id })
    expect(kept?.categoryId).toBe(comida.id)
  })
})

describe('deleteCategory', () => {
  it('deletes a category nothing references', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const salud = categoryOrThrow(byName, 'Salud')

    await deleteCategory({ db, householdId, categoryId: salud.id })

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.name)).not.toContain('Salud')
  })

  it('refuses while an Expense still points at it', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')
    await seedExpense({ db, householdId, categoryId: comida.id })

    await expect(
      deleteCategory({ db, householdId, categoryId: comida.id }),
    ).rejects.toBeInstanceOf(CategoryInUseError)

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.id)).toContain(comida.id)
  })

  // The orphaning guard people forget: a category with no expenses at all can
  // still be the category of a bill.
  it('refuses for a Cuenta even when the category has zero Expenses', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const servicios = categoryOrThrow(byName, 'Servicios')
    await createCuenta({
      db,
      householdId,
      categoryId: servicios.id,
      name: 'Luz',
      dueDate: new Date('2026-12-10T12:00:00'),
      expectedAmount: null,
    })

    await expect(
      deleteCategory({ db, householdId, categoryId: servicios.id }),
    ).rejects.toBeInstanceOf(CategoryInUseError)

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.id)).toContain(servicios.id)
  })
})

describe('mergeCategories', () => {
  it('moves every Expense and Cuenta onto the survivor and drops the source', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const source = categoryOrThrow(byName, 'Comida')
    const survivor = categoryOrThrow(byName, 'Transporte')
    const expense = await seedExpense({
      db,
      householdId,
      categoryId: source.id,
    })
    const cuenta = await createCuenta({
      db,
      householdId,
      categoryId: source.id,
      name: 'Verdulería',
      dueDate: new Date('2026-12-10T12:00:00'),
      expectedAmount: 500,
    })

    await mergeCategories({
      db,
      householdId,
      sourceCategoryId: source.id,
      survivorCategoryId: survivor.id,
    })

    expect(
      (await db.getExpense({ householdId, expenseId: expense.id }))?.categoryId,
    ).toBe(survivor.id)
    expect(
      (await db.getCuenta({ householdId, cuentaId: cuenta.id }))?.categoryId,
    ).toBe(survivor.id)

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.id)).not.toContain(source.id)
    // The survivor keeps its own identity -- merge never renames or recolours.
    expect(categories.find((c) => c.id === survivor.id)).toMatchObject({
      name: survivor.name,
      color: survivor.color,
    })
  })

  it('refuses to merge a category into itself', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = categoryOrThrow(byName, 'Comida')

    await expect(
      mergeCategories({
        db,
        householdId,
        sourceCategoryId: comida.id,
        survivorCategoryId: comida.id,
      }),
    ).rejects.toThrow('consigo misma')

    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.id)).toContain(comida.id)
  })
})

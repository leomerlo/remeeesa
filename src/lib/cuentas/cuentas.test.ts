import { describe, expect, it, vi } from 'vitest'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import {
  createExpense,
  findOrCreateCategory,
  listCategories,
  listExpensesInMonth,
  listRecentExpenses,
} from '@/lib/expenses/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  createCuenta,
  CuentaAlreadyPaidError,
  CuentaNotFoundError,
  deleteCuenta,
  getCuenta,
  listPendingCuentas,
  markCuentaPaid,
  updateCuenta,
} from './cuentas'

describe('createCuenta', () => {
  it('creates a pending, non-recurring cuenta with no paid expense', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const dueDate = new Date(2026, 8, 10)

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate,
      expectedAmount: 500,
    })

    expect(cuenta).toEqual({
      id: expect.any(String),
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate,
      expectedAmount: 500,
      recurring: false,
      status: 'pending',
      paidExpenseId: null,
      createdAt: expect.any(Date),
    })
  })

  it('creates a recurring cuenta when recurring is passed as true', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Streaming',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 15,
      recurring: true,
    })

    expect(cuenta.recurring).toBe(true)
  })

  it('allows a null expected amount', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Luz',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })

    expect(cuenta.expectedAmount).toBeNull()
  })

  it('allows a due date in the past', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const pastDate = new Date(2020, 0, 1)

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Vieja deuda',
      dueDate: pastDate,
      expectedAmount: null,
    })

    expect(cuenta.dueDate).toEqual(pastDate)
  })

  it('trims the cuenta name and rejects a blank one', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: '  Alquiler  ',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })
    expect(cuenta.name).toBe('Alquiler')

    await expect(
      createCuenta({
        db,
        householdId: household.id,
        categoryId: comida.id,
        name: '   ',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: null,
      }),
    ).rejects.toThrow('El nombre de la cuenta no puede estar vacío')
  })

  it('rejects a non-positive expected amount', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }

    await expect(
      createCuenta({
        db,
        householdId: household.id,
        categoryId: comida.id,
        name: 'Alquiler',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: 0,
      }),
    ).rejects.toThrow(
      'El monto esperado de la cuenta debe ser un número positivo',
    )
  })

  it('rejects an unknown category', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      createCuenta({
        db,
        householdId: household.id,
        categoryId: 'missing-category',
        name: 'Alquiler',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: null,
      }),
    ).rejects.toThrow('Category not found')
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const strangerDb = store.asUser('user-2')

    await expect(
      createCuenta({
        db: strangerDb,
        householdId: household.id,
        categoryId: comida.id,
        name: 'Alquiler',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: null,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('rejects a category that belongs to another household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const other = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })
    const otherCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: other.id,
    })
    const otherComida = otherCategories[0]
    expect(otherComida).toBeDefined()
    if (otherComida === undefined) {
      throw new Error('expected a seeded category')
    }

    await expect(
      createCuenta({
        db: ownerDb,
        householdId: household.id,
        categoryId: otherComida.id,
        name: 'Alquiler',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: null,
      }),
    ).rejects.toThrow('Category not found')
  })

  it('accepts a category resolved through findOrCreateCategory', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const category = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Suscripciones',
    })

    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: category.id,
      name: 'Streaming',
      dueDate: new Date(2026, 8, 12),
      expectedAmount: 15,
    })

    expect(cuenta.categoryId).toBe(category.id)
  })
})

describe('getCuenta', () => {
  it('returns the created cuenta by id', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const created = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    const fetched = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: created.id,
    })

    expect(fetched).toEqual(created)
  })

  it('returns null for a missing cuenta id', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getCuenta({ db, householdId: household.id, cuentaId: 'missing' }),
    ).resolves.toBeNull()
  })

  it('returns null for a cuenta that belongs to another household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const other = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const created = await createCuenta({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    await expect(
      getCuenta({
        db: store.asUser('user-2'),
        householdId: other.id,
        cuentaId: created.id,
      }),
    ).resolves.toBeNull()
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getCuenta({
        db: store.asUser('user-2'),
        householdId: household.id,
        cuentaId: 'anything',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

describe('listPendingCuentas', () => {
  it('returns only pending cuentas for that household, ordered by due date ascending', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const later = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Later',
      dueDate: new Date(2026, 8, 20),
      expectedAmount: null,
    })
    const earlier = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Earlier',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })

    const listed = await listPendingCuentas({ db, householdId: household.id })

    expect(listed.map((cuenta) => cuenta.id)).toEqual([earlier.id, later.id])
  })

  it('excludes paid cuentas', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const pending = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Still pending',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })
    store.seedCuenta({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Already paid',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      createdAt: new Date(),
    })

    const listed = await listPendingCuentas({ db, householdId: household.id })

    expect(listed.map((cuenta) => cuenta.id)).toEqual([pending.id])
  })

  it('returns an empty list for a household with no cuentas', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      listPendingCuentas({ db, householdId: household.id }),
    ).resolves.toEqual([])
  })

  it('does not include another household cuentas', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const other = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })
    const otherCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: other.id,
    })
    const otherComida = otherCategories[0]
    expect(otherComida).toBeDefined()
    if (otherComida === undefined) {
      throw new Error('expected a seeded category')
    }
    await createCuenta({
      db: store.asUser('user-2'),
      householdId: other.id,
      categoryId: otherComida.id,
      name: 'Other bill',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    const listed = await listPendingCuentas({
      db: ownerDb,
      householdId: household.id,
    })

    expect(listed).toEqual([])
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      listPendingCuentas({
        db: store.asUser('user-2'),
        householdId: household.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

async function seedPendingCuenta(input?: {
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
}) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected Comida category')
  }
  const cuenta = await createCuenta({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: input?.expectedAmount ?? 500,
    recurring: input?.recurring ?? false,
  })
  return { db, household, comida, cuenta }
}

describe('updateCuenta', () => {
  it('updates the name only, leaving other fields as stored', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      name: 'Alquiler nuevo',
    })

    expect(updated).toEqual({
      ...cuenta,
      name: 'Alquiler nuevo',
    })
  })

  it('updates the category only', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const otherCategory = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Suscripciones',
    })

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      categoryId: otherCategory.id,
    })

    expect(updated.categoryId).toBe(otherCategory.id)
  })

  it('updates the due date only', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const newDueDate = new Date(2026, 9, 1)

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      dueDate: newDueDate,
    })

    expect(updated.dueDate).toEqual(newDueDate)
  })

  it('updates the expected amount only, including setting it to null', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      expectedAmount: 500,
    })

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      expectedAmount: null,
    })

    expect(updated.expectedAmount).toBeNull()
  })

  it('toggles recurring via updateCuenta', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: false,
    })
    expect(cuenta.recurring).toBe(false)

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      recurring: true,
    })

    expect(updated.recurring).toBe(true)
  })

  it('toggles recurring off via updateCuenta', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
    })
    expect(cuenta.recurring).toBe(true)

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      recurring: false,
    })

    expect(updated.recurring).toBe(false)
  })

  it('updates all fields together with the same validation as create', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const transporte = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Transporte',
    })
    const newDueDate = new Date(2026, 9, 1)

    const updated = await updateCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      name: '  Alquiler nuevo  ',
      categoryId: transporte.id,
      dueDate: newDueDate,
      expectedAmount: 650.456,
      recurring: true,
    })

    expect(updated).toEqual({
      ...cuenta,
      name: 'Alquiler nuevo',
      categoryId: transporte.id,
      dueDate: newDueDate,
      expectedAmount: 650.46,
      recurring: true,
    })
  })

  it('rejects an unknown category id on update, leaving the cuenta unchanged', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        categoryId: 'missing-category',
      }),
    ).rejects.toThrow('Category not found')

    const unchanged = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(unchanged).toEqual(cuenta)
  })

  it('rejects a category that belongs to another household on update', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })
    const other = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })
    const otherCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: other.id,
    })
    const otherComida = otherCategories[0]
    if (otherComida === undefined) {
      throw new Error('expected a seeded category')
    }

    await expect(
      updateCuenta({
        db: ownerDb,
        householdId: household.id,
        cuentaId: cuenta.id,
        categoryId: otherComida.id,
      }),
    ).rejects.toThrow('Category not found')
  })

  it('rejects an invalid due date on update', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        dueDate: new Date(Number.NaN),
      }),
    ).rejects.toThrow('La fecha de la cuenta no es válida')
  })

  it('lets a concurrent edit to a different field overwrite the whole record -- last write wins, no merge', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      expectedAmount: 500,
    })

    const [renamed, repriced] = await Promise.all([
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        name: 'Renamed by member A',
      }),
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        expectedAmount: 700,
      }),
    ])

    expect(renamed.name).toBe('Renamed by member A')
    expect(repriced.expectedAmount).toBe(700)

    // The concurrent write that settles last overwrites the whole record
    // from its own (now-stale) read -- it has no idea the name changed
    // underneath it, so it writes the original name back, silently
    // discarding member A's rename. This is the "last write wins, no
    // merge/conflict UI" behavior from the issue.
    const final = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(final).toEqual({
      ...cuenta,
      expectedAmount: 700,
    })
  })

  it('throws CuentaNotFoundError when another member deleted the cuenta before edit', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await deleteCuenta({
      db: store.asUser('user-2'),
      householdId: household.id,
      cuentaId: cuenta.id,
    })

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        name: 'Stale edit',
      }),
    ).rejects.toThrow(CuentaNotFoundError)
  })

  it('re-validates a changed name, rejecting a blank one', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        name: '   ',
      }),
    ).rejects.toThrow('El nombre de la cuenta no puede estar vacío')
  })

  it('re-validates a changed expected amount, rejecting a non-positive one', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        expectedAmount: 0,
      }),
    ).rejects.toThrow(
      'El monto esperado de la cuenta debe ser un número positivo',
    )
  })

  it('throws CuentaNotFoundError for a missing id', async () => {
    const { db, household } = await seedPendingCuenta()

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: 'missing',
        name: 'Nuevo nombre',
      }),
    ).rejects.toThrow(CuentaNotFoundError)
  })

  it('throws CuentaAlreadyPaidError when the cuenta is no longer pending', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    store.seedCuenta({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      createdAt: new Date(),
    })

    await expect(
      updateCuenta({
        db,
        householdId: household.id,
        cuentaId: 'paid-1',
        name: 'Intento de edición',
      }),
    ).rejects.toThrow(CuentaAlreadyPaidError)
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      updateCuenta({
        db: store.asUser('user-2'),
        householdId: household.id,
        cuentaId: cuenta.id,
        name: 'Intento ajeno',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

describe('deleteCuenta', () => {
  it('deletes a pending cuenta', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await deleteCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })

    await expect(
      getCuenta({ db, householdId: household.id, cuentaId: cuenta.id }),
    ).resolves.toBeNull()
  })

  it('returns CuentaNotFoundError to the loser when two members concurrently delete the same cuenta', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    const [first, second] = await Promise.allSettled([
      deleteCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
      }),
      deleteCuenta({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
      }),
    ])

    const outcomes = [first, second]
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    )
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(CuentaNotFoundError)
  })

  it('never creates, deletes, or otherwise touches any Expense', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const monthStart = new Date(2026, 7, 1)
    const monthEnd = new Date(2026, 9, 0, 23, 59, 59, 999)
    // A pre-existing, unrelated Expense acts as the witness: if deleteCuenta
    // ever touched the Expense store (create or delete), this snapshot
    // would change.
    const seededExpense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Unrelated expense',
      price: 9.5,
      comments: '',
      expenseDate: new Date(2026, 8, 1),
    })
    const before = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart,
      monthEnd,
    })
    expect(before).toEqual([seededExpense])

    await deleteCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })

    const after = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart,
      monthEnd,
    })
    expect(after).toEqual(before)
  })

  it('throws CuentaNotFoundError for a missing id', async () => {
    const { db, household } = await seedPendingCuenta()

    await expect(
      deleteCuenta({
        db,
        householdId: household.id,
        cuentaId: 'missing',
      }),
    ).rejects.toThrow(CuentaNotFoundError)
  })

  it('throws CuentaAlreadyPaidError when the cuenta is no longer pending', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    store.seedCuenta({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      createdAt: new Date(),
    })

    await expect(
      deleteCuenta({
        db,
        householdId: household.id,
        cuentaId: 'paid-1',
      }),
    ).rejects.toThrow(CuentaAlreadyPaidError)
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      deleteCuenta({
        db: store.asUser('user-2'),
        householdId: household.id,
        cuentaId: cuenta.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

// Every scenario above goes through the domain-layer updateCuenta/deleteCuenta
// wrapper, whose own getPendingCuentaOrThrow pre-check always intercepts a
// paid cuenta first -- so the HouseholdsDb implementation's own status
// re-check (added specifically to narrow the TOCTOU window between that
// domain pre-check and the actual write, mirroring firestore.rules'
// isValidCuentaUpdate()/delete-rule requiring status == 'pending') is never
// otherwise exercised. These tests call db.updateCuenta/db.deleteCuenta
// directly, bypassing the domain wrapper, to prove the fixture's own guard
// works standalone.
describe('memoryHouseholdsDb updateCuenta/deleteCuenta (bypassing the domain wrapper)', () => {
  it('updateCuenta throws CuentaAlreadyPaidError when the stored cuenta is no longer pending', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    // Simulates another member marking it paid between this test's earlier
    // read and the write below -- store.seedCuenta overwrites the same id.
    store.seedCuenta({ ...cuenta, status: 'paid', paidExpenseId: 'expense-1' })

    await expect(
      db.updateCuenta({
        householdId: household.id,
        cuentaId: cuenta.id,
        categoryId: comida.id,
        name: 'Intento tardío',
        dueDate: cuenta.dueDate,
        expectedAmount: cuenta.expectedAmount,
        recurring: false,
      }),
    ).rejects.toThrow(CuentaAlreadyPaidError)
  })

  it('deleteCuenta throws CuentaAlreadyPaidError when the stored cuenta is no longer pending', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    store.seedCuenta({ ...cuenta, status: 'paid', paidExpenseId: 'expense-1' })

    await expect(
      db.deleteCuenta({ householdId: household.id, cuentaId: cuenta.id }),
    ).rejects.toThrow(CuentaAlreadyPaidError)
  })
})

describe('markCuentaPaid', () => {
  it('marks a pending cuenta paid, creating an expense with the final amount, payment date, cuenta category, and paying member', async () => {
    const { db, household, comida, cuenta } = await seedPendingCuenta()
    const paymentDate = new Date(2026, 7, 28)

    const { cuenta: paid, expense } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate,
    })

    expect(paid.status).toBe('paid')
    expect(paid.paidExpenseId).toBe(expense.id)
    expect(expense.categoryId).toBe(comida.id)
    expect(expense.price).toBe(480)
    expect(expense.expenseDate).toEqual(paymentDate)
    expect(expense.memberId).toBe('user-1')
    expect(expense.authorDisplayName).toBe('Ada')
    expect(expense.comments).toBe('')
    expect(expense.name).toBe('Alquiler')
  })

  it('removes the cuenta from listPendingCuentas once marked paid', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending.find((entry) => entry.id === cuenta.id)).toBeUndefined()
  })

  it('rejects a second mark-paid attempt with CuentaAlreadyPaidError and creates exactly one Expense when marked paid twice back-to-back', async () => {
    // memoryHouseholdsDb's markCuentaPaid has no internal await, so these
    // two calls run to completion sequentially rather than truly racing --
    // this proves idempotency on repeated calls, not concurrent-write safety
    // under real interleaving (that guarantee comes from the Firestore
    // transaction itself, checked structurally in firestoreHouseholdsDb.test.ts).
    const { db, household, cuenta } = await seedPendingCuenta()

    const [first, second] = await Promise.allSettled([
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ])

    const outcomes = [first, second]
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1)
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    )
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(CuentaAlreadyPaidError)

    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(1)
  })

  it('leaves no orphaned state when a failure strikes between the status check and the writes', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const randomUUIDSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })

    await expect(
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow('boom')
    randomUUIDSpy.mockRestore()

    const stillPending = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(stillPending?.status).toBe('pending')
    expect(stillPending?.paidExpenseId).toBeNull()

    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)
  })

  // The recurring path builds three records (expense, paid cuenta, next
  // cycle) and must still commit all-or-nothing. The failure is planted on
  // the *second* id generation, so it lands after the expense id already
  // exists but before any store mutation -- the worst spot for a partial
  // write, and the one a naive "set as you go" implementation would leak
  // both a paid original and a dangling next cycle from.
  it('leaves no orphaned state -- not even a dangling next cycle -- when a recurring mark-paid fails midway', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
    })
    const randomUUIDSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementationOnce(() => '00000000-0000-4000-8000-000000000001')
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })

    try {
      await expect(
        markCuentaPaid({
          db,
          householdId: household.id,
          cuentaId: cuenta.id,
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          finalAmount: 480,
          paymentDate: new Date(2026, 7, 28),
        }),
      ).rejects.toThrow('boom')
    } finally {
      // Restored even if the assertion above fails, so a leftover armed
      // mockImplementationOnce can't bleed into the next test's setup.
      randomUUIDSpy.mockRestore()
    }

    const stillPending = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(stillPending?.status).toBe('pending')
    expect(stillPending?.paidExpenseId).toBeNull()

    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)

    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(cuenta.id)
  })

  it('throws CuentaNotFoundError for a missing cuenta id', async () => {
    const { db, household } = await seedPendingCuenta()

    await expect(
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: 'missing',
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(CuentaNotFoundError)
  })

  it('throws CuentaNotFoundError for a cuenta id belonging to a different household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const otherDb = store.asUser('user-2')
    const otherHousehold = await createHouseholdWithMembership({
      db: otherDb,
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })
    const otherCategories = await listCategories({
      db: otherDb,
      householdId: otherHousehold.id,
    })
    const otherComida = otherCategories[0]
    if (otherComida === undefined) {
      throw new Error('expected a seeded category')
    }
    const otherCuenta = await createCuenta({
      db: otherDb,
      householdId: otherHousehold.id,
      categoryId: otherComida.id,
      name: 'Internet',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 100,
    })

    await expect(
      markCuentaPaid({
        db: ownerDb,
        householdId: household.id,
        cuentaId: otherCuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(CuentaNotFoundError)
  })

  it('rejects a non-positive finalAmount before touching the cuenta or creating an expense', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 0,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow('El precio del gasto debe ser un número positivo')

    const stillPending = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(stillPending?.status).toBe('pending')
    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)
  })

  it('rejects a future paymentDate before touching the cuenta or creating an expense', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    await expect(
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 9, 15),
      }),
    ).rejects.toThrow('La fecha del gasto no puede ser futura')

    const stillPending = await getCuenta({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
    })
    expect(stillPending?.status).toBe('pending')
    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)
  })

  it('allows a paymentDate of exactly today', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()
    const today = new Date()

    const { expense } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: today,
    })

    expect(expense.expenseDate).toEqual(today)
  })

  it('rounds finalAmount to 2 decimal places, same as parseExpensePrice', async () => {
    const { db, household, cuenta } = await seedPendingCuenta()

    const { expense } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480.456,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(expense.price).toBe(480.46)
  })

  it('spawns the next cycle for a recurring cuenta: same name and category, still recurring, pending, one month later, with a fresh id', async () => {
    const { db, household, comida, cuenta } = await seedPendingCuenta({
      recurring: true,
    })

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextCuenta).not.toBeNull()
    expect(nextCuenta?.id).not.toBe(cuenta.id)
    expect(nextCuenta?.householdId).toBe(household.id)
    expect(nextCuenta?.categoryId).toBe(comida.id)
    expect(nextCuenta?.name).toBe('Alquiler')
    expect(nextCuenta?.recurring).toBe(true)
    expect(nextCuenta?.status).toBe('pending')
    expect(nextCuenta?.paidExpenseId).toBeNull()
    expect(nextCuenta?.dueDate).toEqual(new Date(2026, 9, 10))
  })

  it('never carries the previous cycle expected amount over to the next cycle', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
      expectedAmount: 480,
    })
    expect(cuenta.expectedAmount).toBe(480)

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextCuenta?.expectedAmount).toBeNull()
  })

  it('leaves the next cycle as the only pending cuenta right after a recurring mark-paid', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
    })

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(nextCuenta?.id)
  })

  // The single strongest guarantee that recurrence actually recurs: the
  // auto-created cycle has to be marked paid successfully and spawn a third
  // cycle of its own. A next cycle written with recurring: false would pass
  // every other test here and only fail this one.
  it('keeps the series going: the auto-created cycle can itself be marked paid and spawns a third cycle', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
    })

    const { nextCuenta: second } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })
    if (second === null) {
      throw new Error('expected a second cycle')
    }

    const { nextCuenta: third } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: second.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 500,
      paymentDate: new Date(2026, 7, 29),
    })

    expect(third?.dueDate).toEqual(new Date(2026, 10, 10))
    expect(third?.recurring).toBe(true)
    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(third?.id)
  })

  // The next cycle is derived from the stored due date, not the payment date,
  // so paying a long-overdue bill lands the member on the next *missed*
  // cycle rather than skipping ahead to a future one -- they mark each stale
  // cycle paid to catch up. Pinned here so the choice is deliberate.
  it('derives the next due date from the stored due date, not the payment date, for an overdue cuenta', async () => {
    const { db, household, comida } = await seedPendingCuenta()
    const overdue = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Luz',
      dueDate: new Date(2026, 1, 10),
      expectedAmount: null,
      recurring: true,
    })

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: overdue.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextCuenta?.dueDate).toEqual(new Date(2026, 2, 10))
  })

  it('clamps the next due date to the last day of a shorter target month', async () => {
    const { db, household, comida } = await seedPendingCuenta()
    const recurring = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(2026, 0, 31),
      expectedAmount: null,
      recurring: true,
    })

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: recurring.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextCuenta?.dueDate).toEqual(new Date(2026, 1, 28))
  })

  it('creates no next cycle for a non-recurring cuenta', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: false,
    })

    const { nextCuenta } = await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: cuenta.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextCuenta).toBeNull()
    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending).toHaveLength(0)
  })

  // The recurring counterpart of the "exactly one Expense" idempotency test
  // above: a double submit (or two members hitting Pagar at once) must not
  // leave the household with two next cycles for the same bill, which would
  // duplicate every following cycle too. Same caveat as that test --
  // memoryHouseholdsDb's markCuentaPaid has no internal await, so these run
  // sequentially rather than truly interleaved; the concurrent-write
  // guarantee itself comes from the Firestore transaction.
  it('spawns exactly one next cycle when a recurring cuenta is marked paid twice back-to-back', async () => {
    const { db, household, cuenta } = await seedPendingCuenta({
      recurring: true,
    })

    const outcomes = await Promise.allSettled([
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
      markCuentaPaid({
        db,
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ])

    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    )
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.reason).toBeInstanceOf(CuentaAlreadyPaidError)

    const pending = await listPendingCuentas({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).not.toBe(cuenta.id)
    expect(pending[0]?.dueDate).toEqual(new Date(2026, 9, 10))
  })

  it('denies a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      markCuentaPaid({
        db: store.asUser('user-2'),
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-2',
        authorDisplayName: 'Intento ajeno',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

// Every markCuentaPaid scenario above goes through the domain wrapper, which
// forwards memberId straight through without checking it against the
// authenticated caller. The real Firestore adapter never trusts
// input.memberId either way -- it resolves the actual member id itself via
// awaitAuthenticatedUserId (see the "markCuentaPaid adapter" describe block
// in firestoreHouseholdsDb.test.ts) -- so this fixture's own anti-spoof
// check (mirroring createExpense's) is what stands between a malicious
// caller and impersonating a housemate in this test double. These tests
// call db.markCuentaPaid directly, bypassing the domain wrapper, to prove
// the fixture's own guards work standalone.
describe('memoryHouseholdsDb markCuentaPaid (bypassing the domain wrapper)', () => {
  it('throws HouseholdAccessDeniedError when a member spoofs memberId to impersonate a different member of the same household', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    // user-1 is a genuine member, calling as themself, but claims the
    // resulting expense should be attributed to user-2 -- also a genuine
    // member of the same household, not an outsider. assertMemberOf alone
    // would let this through since user-1 IS a member; only the explicit
    // memberId === userId check catches the impersonation.
    await expect(
      db.markCuentaPaid({
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-2',
        authorDisplayName: 'Spoofed as user-2',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('throws CuentaAlreadyPaidError when the stored cuenta is no longer pending, even with paidExpenseId already set', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories[0]
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const cuenta = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    // Simulates another member marking it paid between this test's earlier
    // read and the write below -- store.seedCuenta overwrites the same id,
    // leaving paidExpenseId already populated from that earlier mark-paid.
    store.seedCuenta({ ...cuenta, status: 'paid', paidExpenseId: 'expense-1' })

    await expect(
      db.markCuentaPaid({
        householdId: household.id,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Intento tardío',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(CuentaAlreadyPaidError)
  })
})

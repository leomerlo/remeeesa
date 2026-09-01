import { describe, expect, it } from 'vitest'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import {
  createExpense,
  findOrCreateCategory,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  createCuenta,
  CuentaAlreadyPaidError,
  CuentaNotFoundError,
  deleteCuenta,
  getCuenta,
  listPendingCuentas,
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
    ).rejects.toThrow('El monto esperado de la cuenta debe ser un número positivo')
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

    const listed = await listPendingCuentas({ db: ownerDb, householdId: household.id })

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
    ).rejects.toThrow('El monto esperado de la cuenta debe ser un número positivo')
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

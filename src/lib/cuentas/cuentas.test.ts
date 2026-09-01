import { describe, expect, it } from 'vitest'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import { findOrCreateCategory, listCategories } from '@/lib/expenses/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createCuenta, getCuenta, listPendingCuentas } from './cuentas'

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

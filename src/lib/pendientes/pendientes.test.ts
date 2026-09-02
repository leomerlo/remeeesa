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
  createPendiente,
  PendienteAlreadyPaidError,
  PendienteNotFoundError,
  deletePendiente,
  getPendiente,
  listPendientes,
  listPendientesForMonth,
  markPendientePaid,
  updatePendiente,
} from './pendientes'

describe('createPendiente', () => {
  it('creates a pending, non-recurring pendiente with no paid expense', async () => {
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate,
      expectedAmount: 500,
    })

    expect(pendiente).toEqual({
      id: expect.any(String),
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate,
      expectedAmount: 500,
      recurring: false,
      status: 'pending',
      paidExpenseId: null,
      paidAt: null,
      createdAt: expect.any(Date),
    })
  })

  it('creates a recurring pendiente when recurring is passed as true', async () => {
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Streaming',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 15,
      recurring: true,
    })

    expect(pendiente.recurring).toBe(true)
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Luz',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })

    expect(pendiente.expectedAmount).toBeNull()
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Vieja deuda',
      dueDate: pastDate,
      expectedAmount: null,
    })

    expect(pendiente.dueDate).toEqual(pastDate)
  })

  it('trims the pendiente name and rejects a blank one', async () => {
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: '  Alquiler  ',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })
    expect(pendiente.name).toBe('Alquiler')

    await expect(
      createPendiente({
        db,
        householdId: household.id,
        categoryId: comida.id,
        name: '   ',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: null,
      }),
    ).rejects.toThrow('El nombre del pendiente no puede estar vacío')
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
      createPendiente({
        db,
        householdId: household.id,
        categoryId: comida.id,
        name: 'Alquiler',
        dueDate: new Date(2026, 8, 10),
        expectedAmount: 0,
      }),
    ).rejects.toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
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
      createPendiente({
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
      createPendiente({
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
      createPendiente({
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

    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: category.id,
      name: 'Streaming',
      dueDate: new Date(2026, 8, 12),
      expectedAmount: 15,
    })

    expect(pendiente.categoryId).toBe(category.id)
  })
})

describe('getPendiente', () => {
  it('returns the created pendiente by id', async () => {
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
    const created = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    const fetched = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: created.id,
    })

    expect(fetched).toEqual(created)
  })

  it('returns null for a missing pendiente id', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      getPendiente({ db, householdId: household.id, pendienteId: 'missing' }),
    ).resolves.toBeNull()
  })

  it('returns null for a pendiente that belongs to another household', async () => {
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
    const created = await createPendiente({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    await expect(
      getPendiente({
        db: store.asUser('user-2'),
        householdId: other.id,
        pendienteId: created.id,
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
      getPendiente({
        db: store.asUser('user-2'),
        householdId: household.id,
        pendienteId: 'anything',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

describe('listPendientes', () => {
  it('returns only pending pendientes for that household, ordered by due date ascending', async () => {
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
    const later = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Later',
      dueDate: new Date(2026, 8, 20),
      expectedAmount: null,
    })
    const earlier = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Earlier',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })

    const listed = await listPendientes({ db, householdId: household.id })

    expect(listed.map((pendiente) => pendiente.id)).toEqual([
      earlier.id,
      later.id,
    ])
  })

  it('excludes paid pendientes', async () => {
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
    const pending = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Still pending',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
    })
    store.seedPendiente({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Already paid',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(),
      createdAt: new Date(),
    })

    const listed = await listPendientes({ db, householdId: household.id })

    expect(listed.map((pendiente) => pendiente.id)).toEqual([pending.id])
  })

  it('returns an empty list for a household with no pendientes', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      listPendientes({ db, householdId: household.id }),
    ).resolves.toEqual([])
  })

  it('does not include another household pendientes', async () => {
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
    await createPendiente({
      db: store.asUser('user-2'),
      householdId: other.id,
      categoryId: otherComida.id,
      name: 'Other bill',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    const listed = await listPendientes({
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
      listPendientes({
        db: store.asUser('user-2'),
        householdId: household.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

async function seedPendingPendiente(input?: {
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
  const pendiente = await createPendiente({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: input?.expectedAmount ?? 500,
    recurring: input?.recurring ?? false,
  })
  return { db, household, comida, pendiente }
}

describe('listPendientesForMonth', () => {
  it('includes every pending pendiente regardless of its due date', async () => {
    const { db, household, comida } = await seedPendingPendiente()
    // Overdue by a lot -- still pending, so still owed, regardless of the
    // month being viewed.
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Vieja factura',
      dueDate: new Date(2026, 2, 1),
      expectedAmount: 100,
    })

    const listed = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 8, 1),
      monthEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
    })

    expect(listed.map((pendiente) => pendiente.name).sort()).toEqual(
      ['Alquiler', 'Vieja factura'].sort(),
    )
  })

  it('includes a pendiente paid within the given month', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 500,
      paymentDate: new Date(2026, 7, 15),
    })

    const listed = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    const paidEntry = listed.find((entry) => entry.id === pendiente.id)
    expect(paidEntry).toBeDefined()
    expect(paidEntry?.status).toBe('paid')
  })

  it('excludes a pendiente paid in a different month', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 500,
      paymentDate: new Date(2026, 6, 15), // July, not August
    })

    const listed = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed.find((entry) => entry.id === pendiente.id)).toBeUndefined()
  })

  it('lists pending entries before paid-this-month entries', async () => {
    const {
      db,
      household,
      comida,
      pendiente: paidSoon,
    } = await seedPendingPendiente()
    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: paidSoon.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 500,
      paymentDate: new Date(2026, 7, 5),
    })
    const stillPending = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(2026, 8, 20),
      expectedAmount: 300,
    })

    const listed = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed.map((entry) => entry.id)).toEqual([
      stillPending.id,
      paidSoon.id,
    ])
  })
})

describe('updatePendiente', () => {
  it('updates the name only, leaving other fields as stored', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      name: 'Alquiler nuevo',
    })

    expect(updated).toEqual({
      ...pendiente,
      name: 'Alquiler nuevo',
    })
  })

  it('updates the category only', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()
    const otherCategory = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Suscripciones',
    })

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      categoryId: otherCategory.id,
    })

    expect(updated.categoryId).toBe(otherCategory.id)
  })

  it('updates the due date only', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()
    const newDueDate = new Date(2026, 9, 1)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      dueDate: newDueDate,
    })

    expect(updated.dueDate).toEqual(newDueDate)
  })

  it('updates the expected amount only, including setting it to null', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      expectedAmount: 500,
    })

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      expectedAmount: null,
    })

    expect(updated.expectedAmount).toBeNull()
  })

  it('toggles recurring via updatePendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: false,
    })
    expect(pendiente.recurring).toBe(false)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      recurring: true,
    })

    expect(updated.recurring).toBe(true)
  })

  it('toggles recurring off via updatePendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
    })
    expect(pendiente.recurring).toBe(true)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      recurring: false,
    })

    expect(updated.recurring).toBe(false)
  })

  it('updates all fields together with the same validation as create', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()
    const transporte = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Transporte',
    })
    const newDueDate = new Date(2026, 9, 1)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      name: '  Alquiler nuevo  ',
      categoryId: transporte.id,
      dueDate: newDueDate,
      expectedAmount: 650.456,
      recurring: true,
    })

    expect(updated).toEqual({
      ...pendiente,
      name: 'Alquiler nuevo',
      categoryId: transporte.id,
      dueDate: newDueDate,
      expectedAmount: 650.46,
      recurring: true,
    })
  })

  it('rejects an unknown category id on update, leaving the pendiente unchanged', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        categoryId: 'missing-category',
      }),
    ).rejects.toThrow('Category not found')

    const unchanged = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })
    expect(unchanged).toEqual(pendiente)
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
    const pendiente = await createPendiente({
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
      updatePendiente({
        db: ownerDb,
        householdId: household.id,
        pendienteId: pendiente.id,
        categoryId: otherComida.id,
      }),
    ).rejects.toThrow('Category not found')
  })

  it('rejects an invalid due date on update', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        dueDate: new Date(Number.NaN),
      }),
    ).rejects.toThrow('La fecha del pendiente no es válida')
  })

  it('lets a concurrent edit to a different field overwrite the whole record -- last write wins, no merge', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      expectedAmount: 500,
    })

    const [renamed, repriced] = await Promise.all([
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        name: 'Renamed by member A',
      }),
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
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
    const final = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })
    expect(final).toEqual({
      ...pendiente,
      expectedAmount: 700,
    })
  })

  it('throws PendienteNotFoundError when another member deleted the pendiente before edit', async () => {
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
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await deletePendiente({
      db: store.asUser('user-2'),
      householdId: household.id,
      pendienteId: pendiente.id,
    })

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        name: 'Stale edit',
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })

  it('re-validates a changed name, rejecting a blank one', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        name: '   ',
      }),
    ).rejects.toThrow('El nombre del pendiente no puede estar vacío')
  })

  it('re-validates a changed expected amount, rejecting a non-positive one', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        expectedAmount: 0,
      }),
    ).rejects.toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
  })

  it('throws PendienteNotFoundError for a missing id', async () => {
    const { db, household } = await seedPendingPendiente()

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: 'missing',
        name: 'Nuevo nombre',
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })

  it('throws PendienteAlreadyPaidError when the pendiente is no longer pending', async () => {
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
    store.seedPendiente({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(),
      createdAt: new Date(),
    })

    await expect(
      updatePendiente({
        db,
        householdId: household.id,
        pendienteId: 'paid-1',
        name: 'Intento de edición',
      }),
    ).rejects.toThrow(PendienteAlreadyPaidError)
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
    const pendiente = await createPendiente({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      updatePendiente({
        db: store.asUser('user-2'),
        householdId: household.id,
        pendienteId: pendiente.id,
        name: 'Intento ajeno',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

describe('deletePendiente', () => {
  it('deletes a pending pendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await deletePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })

    await expect(
      getPendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
      }),
    ).resolves.toBeNull()
  })

  it('returns PendienteNotFoundError to the loser when two members concurrently delete the same pendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    const [first, second] = await Promise.allSettled([
      deletePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
      }),
      deletePendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
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
    expect(rejected[0]?.reason).toBeInstanceOf(PendienteNotFoundError)
  })

  it('never creates, deletes, or otherwise touches any Expense', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const monthStart = new Date(2026, 7, 1)
    const monthEnd = new Date(2026, 9, 0, 23, 59, 59, 999)
    // A pre-existing, unrelated Expense acts as the witness: if deletePendiente
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

    await deletePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })

    const after = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart,
      monthEnd,
    })
    expect(after).toEqual(before)
  })

  it('throws PendienteNotFoundError for a missing id', async () => {
    const { db, household } = await seedPendingPendiente()

    await expect(
      deletePendiente({
        db,
        householdId: household.id,
        pendienteId: 'missing',
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })

  it('throws PendienteAlreadyPaidError when the pendiente is no longer pending', async () => {
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
    store.seedPendiente({
      id: 'paid-1',
      householdId: household.id,
      categoryId: comida.id,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 300,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(),
      createdAt: new Date(),
    })

    await expect(
      deletePendiente({
        db,
        householdId: household.id,
        pendienteId: 'paid-1',
      }),
    ).rejects.toThrow(PendienteAlreadyPaidError)
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
    const pendiente = await createPendiente({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      deletePendiente({
        db: store.asUser('user-2'),
        householdId: household.id,
        pendienteId: pendiente.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

// Every scenario above goes through the domain-layer updatePendiente/deletePendiente
// wrapper, whose own getPendienteOrThrow pre-check always intercepts a
// paid pendiente first -- so the HouseholdsDb implementation's own status
// re-check (added specifically to narrow the TOCTOU window between that
// domain pre-check and the actual write, mirroring firestore.rules'
// isValidPendienteUpdate()/delete-rule requiring status == 'pending') is never
// otherwise exercised. These tests call db.updatePendiente/db.deletePendiente
// directly, bypassing the domain wrapper, to prove the fixture's own guard
// works standalone.
describe('memoryHouseholdsDb updatePendiente/deletePendiente (bypassing the domain wrapper)', () => {
  it('updatePendiente throws PendienteAlreadyPaidError when the stored pendiente is no longer pending', async () => {
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
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    // Simulates another member marking it paid between this test's earlier
    // read and the write below -- store.seedPendiente overwrites the same id.
    store.seedPendiente({
      ...pendiente,
      status: 'paid',
      paidExpenseId: 'expense-1',
    })

    await expect(
      db.updatePendiente({
        householdId: household.id,
        pendienteId: pendiente.id,
        categoryId: comida.id,
        name: 'Intento tardío',
        dueDate: pendiente.dueDate,
        expectedAmount: pendiente.expectedAmount,
        recurring: false,
      }),
    ).rejects.toThrow(PendienteAlreadyPaidError)
  })

  it('deletePendiente throws PendienteAlreadyPaidError when the stored pendiente is no longer pending', async () => {
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
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    store.seedPendiente({
      ...pendiente,
      status: 'paid',
      paidExpenseId: 'expense-1',
    })

    await expect(
      db.deletePendiente({
        householdId: household.id,
        pendienteId: pendiente.id,
      }),
    ).rejects.toThrow(PendienteAlreadyPaidError)
  })
})

describe('markPendientePaid', () => {
  it('marks a pending pendiente paid, creating an expense with the final amount, payment date, pendiente category, and paying member', async () => {
    const { db, household, comida, pendiente } = await seedPendingPendiente()
    const paymentDate = new Date(2026, 7, 28)

    const { pendiente: paid, expense } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate,
    })

    expect(paid.status).toBe('paid')
    expect(paid.paidExpenseId).toBe(expense.id)
    expect(paid.paidAt).toEqual(paymentDate)
    expect(expense.categoryId).toBe(comida.id)
    expect(expense.price).toBe(480)
    expect(expense.expenseDate).toEqual(paymentDate)
    expect(expense.memberId).toBe('user-1')
    expect(expense.authorDisplayName).toBe('Ada')
    expect(expense.comments).toBe('')
    expect(expense.name).toBe('Alquiler')
  })

  it('removes the pendiente from listPendientes once marked paid', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending.find((entry) => entry.id === pendiente.id)).toBeUndefined()
  })

  it('rejects a second mark-paid attempt with PendienteAlreadyPaidError and creates exactly one Expense when marked paid twice back-to-back', async () => {
    // memoryHouseholdsDb's markPendientePaid has no internal await, so these
    // two calls run to completion sequentially rather than truly racing --
    // this proves idempotency on repeated calls, not concurrent-write safety
    // under real interleaving (that guarantee comes from the Firestore
    // transaction itself, checked structurally in firestoreHouseholdsDb.test.ts).
    const { db, household, pendiente } = await seedPendingPendiente()

    const [first, second] = await Promise.allSettled([
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
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
    expect(rejected[0]?.reason).toBeInstanceOf(PendienteAlreadyPaidError)

    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(1)
  })

  it('leaves no orphaned state when a failure strikes between the status check and the writes', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()
    const randomUUIDSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockImplementationOnce(() => {
        throw new Error('boom')
      })

    await expect(
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow('boom')
    randomUUIDSpy.mockRestore()

    const stillPending = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
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

  // The recurring path builds three records (expense, paid pendiente, next
  // cycle) and must still commit all-or-nothing. The failure is planted on
  // the *second* id generation, so it lands after the expense id already
  // exists but before any store mutation -- the worst spot for a partial
  // write, and the one a naive "set as you go" implementation would leak
  // both a paid original and a dangling next cycle from.
  it('leaves no orphaned state -- not even a dangling next cycle -- when a recurring mark-paid fails midway', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
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
        markPendientePaid({
          db,
          householdId: household.id,
          pendienteId: pendiente.id,
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

    const stillPending = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })
    expect(stillPending?.status).toBe('pending')
    expect(stillPending?.paidExpenseId).toBeNull()

    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)

    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(pendiente.id)
  })

  it('throws PendienteNotFoundError for a missing pendiente id', async () => {
    const { db, household } = await seedPendingPendiente()

    await expect(
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: 'missing',
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })

  it('throws PendienteNotFoundError for a pendiente id belonging to a different household', async () => {
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
    const otherPendiente = await createPendiente({
      db: otherDb,
      householdId: otherHousehold.id,
      categoryId: otherComida.id,
      name: 'Internet',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 100,
    })

    await expect(
      markPendientePaid({
        db: ownerDb,
        householdId: household.id,
        pendienteId: otherPendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })

  it('rejects a non-positive finalAmount before touching the pendiente or creating an expense', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 0,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow('El precio del gasto debe ser un número positivo')

    const stillPending = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
    })
    expect(stillPending?.status).toBe('pending')
    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(0)
  })

  it('rejects a future paymentDate before touching the pendiente or creating an expense', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    await expect(
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 9, 15),
      }),
    ).rejects.toThrow('La fecha del gasto no puede ser futura')

    const stillPending = await getPendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
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
    const { db, household, pendiente } = await seedPendingPendiente()
    const today = new Date()

    const { expense } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: today,
    })

    expect(expense.expenseDate).toEqual(today)
  })

  it('rounds finalAmount to 2 decimal places, same as parseExpensePrice', async () => {
    const { db, household, pendiente } = await seedPendingPendiente()

    const { expense } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480.456,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(expense.price).toBe(480.46)
  })

  it('spawns the next cycle for a recurring pendiente: same name and category, still recurring, pending, one month later, with a fresh id', async () => {
    const { db, household, comida, pendiente } = await seedPendingPendiente({
      recurring: true,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente).not.toBeNull()
    expect(nextPendiente?.id).not.toBe(pendiente.id)
    expect(nextPendiente?.householdId).toBe(household.id)
    expect(nextPendiente?.categoryId).toBe(comida.id)
    expect(nextPendiente?.name).toBe('Alquiler')
    expect(nextPendiente?.recurring).toBe(true)
    expect(nextPendiente?.status).toBe('pending')
    expect(nextPendiente?.paidExpenseId).toBeNull()
    expect(nextPendiente?.dueDate).toEqual(new Date(2026, 9, 10))
  })

  it('leaves the next cycle unpaid, with paidAt still null', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente?.paidAt).toBeNull()
  })

  it('pre-fills the next cycle expected amount with the amount just paid, not the earlier estimate', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
      expectedAmount: 480,
    })
    expect(pendiente.expectedAmount).toBe(480)

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      // Paid a different amount than originally expected -- the next
      // cycle should carry the real, just-paid figure, not the stale 480
      // estimate from before.
      finalAmount: 500,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente?.expectedAmount).toBe(500)
  })

  it('leaves the next cycle as the only pending pendiente right after a recurring mark-paid', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(nextPendiente?.id)
  })

  // The single strongest guarantee that recurrence actually recurs: the
  // auto-created cycle has to be marked paid successfully and spawn a third
  // cycle of its own. A next cycle written with recurring: false would pass
  // every other test here and only fail this one.
  it('keeps the series going: the auto-created cycle can itself be marked paid and spawns a third cycle', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
    })

    const { nextPendiente: second } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })
    if (second === null) {
      throw new Error('expected a second cycle')
    }

    const { nextPendiente: third } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: second.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 500,
      paymentDate: new Date(2026, 7, 29),
    })

    expect(third?.dueDate).toEqual(new Date(2026, 10, 10))
    expect(third?.recurring).toBe(true)
    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).toBe(third?.id)
  })

  // The next cycle is derived from the stored due date, not the payment date,
  // so paying a long-overdue bill lands the member on the next *missed*
  // cycle rather than skipping ahead to a future one -- they mark each stale
  // cycle paid to catch up. Pinned here so the choice is deliberate.
  it('derives the next due date from the stored due date, not the payment date, for an overdue pendiente', async () => {
    const { db, household, comida } = await seedPendingPendiente()
    const overdue = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Luz',
      dueDate: new Date(2026, 1, 10),
      expectedAmount: null,
      recurring: true,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: overdue.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente?.dueDate).toEqual(new Date(2026, 2, 10))
  })

  it('clamps the next due date to the last day of a shorter target month', async () => {
    const { db, household, comida } = await seedPendingPendiente()
    const recurring = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(2026, 0, 31),
      expectedAmount: null,
      recurring: true,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: recurring.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente?.dueDate).toEqual(new Date(2026, 1, 28))
  })

  it('creates no next cycle for a non-recurring pendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: false,
    })

    const { nextPendiente } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(nextPendiente).toBeNull()
    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toHaveLength(0)
  })

  // The recurring counterpart of the "exactly one Expense" idempotency test
  // above: a double submit (or two members hitting Pagar at once) must not
  // leave the household with two next cycles for the same bill, which would
  // duplicate every following cycle too. Same caveat as that test --
  // memoryHouseholdsDb's markPendientePaid has no internal await, so these run
  // sequentially rather than truly interleaved; the concurrent-write
  // guarantee itself comes from the Firestore transaction.
  it('spawns exactly one next cycle when a recurring pendiente is marked paid twice back-to-back', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
    })

    const outcomes = await Promise.allSettled([
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
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
    expect(rejected[0]?.reason).toBeInstanceOf(PendienteAlreadyPaidError)

    const pending = await listPendientes({ db, householdId: household.id })
    expect(pending).toHaveLength(1)
    expect(pending[0]?.id).not.toBe(pendiente.id)
    expect(pending[0]?.dueDate).toEqual(new Date(2026, 9, 10))

    // Also assert the Expense count on this path specifically. The
    // "exactly one Expense" idempotency test above seeds a non-recurring
    // pendiente (seedPendingPendiente defaults recurring: false), so without this
    // the recurring path -- the one this ticket actually changed, and the
    // one that now performs three writes instead of two -- would have no
    // coverage against double-counting a real household expense.
    const expenses = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })
    expect(expenses).toHaveLength(1)
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
    const pendiente = await createPendiente({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: null,
    })

    await expect(
      markPendientePaid({
        db: store.asUser('user-2'),
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-2',
        authorDisplayName: 'Intento ajeno',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })
})

// Every markPendientePaid scenario above goes through the domain wrapper, which
// forwards memberId straight through without checking it against the
// authenticated caller. The real Firestore adapter never trusts
// input.memberId either way -- it resolves the actual member id itself via
// awaitAuthenticatedUserId (see the "markPendientePaid adapter" describe block
// in firestoreHouseholdsDb.test.ts) -- so this fixture's own anti-spoof
// check (mirroring createExpense's) is what stands between a malicious
// caller and impersonating a housemate in this test double. These tests
// call db.markPendientePaid directly, bypassing the domain wrapper, to prove
// the fixture's own guards work standalone.
describe('memoryHouseholdsDb markPendientePaid (bypassing the domain wrapper)', () => {
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
    const pendiente = await createPendiente({
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
      db.markPendientePaid({
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-2',
        authorDisplayName: 'Spoofed as user-2',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('throws PendienteAlreadyPaidError when the stored pendiente is no longer pending, even with paidExpenseId already set', async () => {
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
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    // Simulates another member marking it paid between this test's earlier
    // read and the write below -- store.seedPendiente overwrites the same id,
    // leaving paidExpenseId already populated from that earlier mark-paid.
    store.seedPendiente({
      ...pendiente,
      status: 'paid',
      paidExpenseId: 'expense-1',
    })

    await expect(
      db.markPendientePaid({
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Intento tardío',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      }),
    ).rejects.toThrow(PendienteAlreadyPaidError)
  })
})

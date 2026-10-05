import { describe, expect, it, vi } from 'vitest'
import {
  createHouseholdWithMembership,
  HouseholdAccessDeniedError,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
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
  carryRecurrentes,
  listRecurrentesToCarry,
  markPendientePaid,
  setPendienteRecurrence,
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
      autoDebit: false,
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
      autoDebit: false,
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
      autoDebit: false,
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
  readonly autoDebit?: boolean
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

  // Due September, settled in August -- it is September's bill either way.
  it('includes a settled pendiente in the month it was due, not the month it was paid', async () => {
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

    const september = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 8, 1),
      monthEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
    })
    const august = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    const paidEntry = september.find((entry) => entry.id === pendiente.id)
    expect(paidEntry).toBeDefined()
    expect(paidEntry?.status).toBe('paid')
    expect(august.find((entry) => entry.id === pendiente.id)).toBeUndefined()
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

  it('lists pending entries before settled ones', async () => {
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

    // Both are due in September, whichever month they were settled in.
    const listed = await listPendientesForMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 8, 1),
      monthEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
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
      autoDebit: false,
    })
    expect(pendiente.recurring).toBe(false)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      recurring: true,
      autoDebit: false,
    })

    expect(updated.recurring).toBe(true)
  })

  it('toggles recurring off via updatePendiente', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
      autoDebit: false,
    })
    expect(pendiente.recurring).toBe(true)

    const updated = await updatePendiente({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      recurring: false,
      autoDebit: false,
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
      autoDebit: false,
    })

    expect(updated).toEqual({
      ...pendiente,
      name: 'Alquiler nuevo',
      categoryId: transporte.id,
      dueDate: newDueDate,
      expectedAmount: 650.46,
      recurring: true,
      autoDebit: false,
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
      autoDebit: false,
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
      autoDebit: false,
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
        autoDebit: false,
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
    // Marks the Expense as a "servicio" (a bill paid through Pendientes),
    // not a plain Gasto -- lets Histórico tell the two apart.
    expect(expense.pendienteId).toBe(pendiente.id)
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

  // Next month's copy is carried over by hand ("Pasar recurrentes"), never
  // spawned by paying -- spawning on pay doubled a bill whenever a payment
  // was undone and paid again.
  it('does not spawn a next cycle when a recurring pendiente is paid', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
      autoDebit: false,
    })

    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 480,
      paymentDate: new Date(2026, 7, 28),
    })

    expect(await listPendientes({ db, householdId: household.id })).toEqual([])
  })

  // A double submit (or two members hitting Pagar at once) must record the
  // payment once. memoryHouseholdsDb's markPendientePaid has no internal
  // await, so these run sequentially rather than truly interleaved; the
  // concurrent-write guarantee itself comes from the Firestore transaction.
  it('records one Expense when a recurring pendiente is marked paid twice back-to-back', async () => {
    const { db, household, pendiente } = await seedPendingPendiente({
      recurring: true,
      autoDebit: false,
    })
    const pay = () =>
      markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 480,
        paymentDate: new Date(2026, 7, 28),
      })

    const outcomes = await Promise.allSettled([pay(), pay()])

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

describe('listRecurrentesToCarry / carryRecurrentes', () => {
  // Viewing August 2026: the candidates are July's recurring bills.
  const august = new Date(2026, 7, 1)

  async function seed() {
    const { db, household, comida } = await seedPendingPendiente()
    const householdId = household.id
    const add = (name: string, dueDate: Date, recurring = true) =>
      createPendiente({
        db,
        householdId,
        categoryId: comida.id,
        name,
        dueDate,
        expectedAmount: 100,
        recurring,
        autoDebit: recurring,
      })
    const pay = (pendienteId: string, paymentDate: Date) =>
      markPendientePaid({
        db,
        householdId,
        pendienteId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 100,
        paymentDate,
      })
    return { db, householdId, add, pay }
  }

  it("lists last month's recurring bills, paid or not, soonest first", async () => {
    const { db, householdId, add, pay } = await seed()
    await add('Luz', new Date(2026, 6, 20))
    const internet = await add('Internet', new Date(2026, 6, 5))
    await pay(internet.id, new Date(2026, 6, 5))
    // Paid late, in August: still July's bill.
    const gas = await add('Gas', new Date(2026, 6, 25))
    await pay(gas.id, new Date(2026, 7, 2))
    await add('Osde', new Date(2026, 6, 15), false)
    await add('Agua', new Date(2026, 5, 10))

    const rows = await listRecurrentesToCarry({
      db,
      householdId,
      monthStart: august,
    })

    expect(rows.map((row) => row.pendiente.name)).toEqual([
      'Internet',
      'Luz',
      'Gas',
    ])
    expect(rows.every((row) => !row.alreadyThere)).toBe(true)
  })

  it('keeps one already in the viewed month on the list, flagged', async () => {
    const { db, householdId, add } = await seed()
    await add('Alquiler', new Date(2026, 6, 10))
    await add('Alquiler', new Date(2026, 7, 10))

    const rows = await listRecurrentesToCarry({
      db,
      householdId,
      monthStart: august,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.alreadyThere).toBe(true)
  })

  it('shows a bill logged twice last month once', async () => {
    const { db, householdId, add } = await seed()
    await add('Seguro de vivienda', new Date(2026, 6, 12))
    await add('Seguro de vivienda', new Date(2026, 6, 12))

    const rows = await listRecurrentesToCarry({
      db,
      householdId,
      monthStart: august,
    })

    expect(rows.map((row) => row.pendiente.name)).toEqual([
      'Seguro de vivienda',
    ])
  })

  it('carries the picked ones a month on, and then lists them as already there', async () => {
    const { db, householdId, add } = await seed()
    const luz = await add('Luz', new Date(2026, 6, 20))
    await add('Internet', new Date(2026, 6, 5))

    const [carried] = await carryRecurrentes({
      db,
      householdId,
      pendientes: [luz],
    })

    expect(carried).toMatchObject({
      name: 'Luz',
      categoryId: luz.categoryId,
      dueDate: new Date(2026, 7, 20),
      expectedAmount: 100,
      recurring: true,
      autoDebit: true,
      status: 'pending',
    })
    const rows = await listRecurrentesToCarry({
      db,
      householdId,
      monthStart: august,
    })
    expect(rows.map((row) => [row.pendiente.name, row.alreadyThere])).toEqual([
      ['Internet', false],
      ['Luz', true],
    ])
  })
})

// Recurrence is the one thing about a Pendiente that outlives its payment:
// whether the bill comes back next month is a question about next month.
// updatePendiente freezes everything on a paid one, so this has its own
// narrow operation -- and its own narrow door in firestore.rules.
describe('setPendienteRecurrence', () => {
  async function seedPaid(): Promise<{
    readonly db: HouseholdsDb
    readonly householdId: string
    readonly pendienteId: string
  }> {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa',
      monthlyBudget: 100000,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const category = categories[0]
    if (category === undefined) {
      throw new Error('expected a seeded category')
    }
    const paidOn = new Date(2026, 7, 10, 12)
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: category.id,
      name: 'Internet',
      dueDate: paidOn,
      expectedAmount: 5000,
    })
    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: paidOn,
    })
    return { db, householdId: household.id, pendienteId: pendiente.id }
  }

  it('turns recurrence on for a pendiente that is already paid', async () => {
    const { db, householdId, pendienteId } = await seedPaid()

    const updated = await setPendienteRecurrence({
      db,
      householdId,
      pendienteId,
      recurring: true,
      autoDebit: true,
    })

    expect(updated).toEqual(
      expect.objectContaining({
        recurring: true,
        autoDebit: true,
        // Changed what happens next month, not the payment.
        status: 'paid',
      }),
    )
  })

  it('takes débito automático with it when recurrence is switched off', async () => {
    const { db, householdId, pendienteId } = await seedPaid()
    await setPendienteRecurrence({
      db,
      householdId,
      pendienteId,
      recurring: true,
      autoDebit: true,
    })

    const updated = await setPendienteRecurrence({
      db,
      householdId,
      pendienteId,
      recurring: false,
      autoDebit: true,
    })

    expect(updated).toEqual(
      expect.objectContaining({ recurring: false, autoDebit: false }),
    )
  })

  it('reports a pendiente that is no longer there', async () => {
    const { db, householdId } = await seedPaid()

    await expect(
      setPendienteRecurrence({
        db,
        householdId,
        pendienteId: 'gone',
        recurring: true,
        autoDebit: false,
      }),
    ).rejects.toThrow(PendienteNotFoundError)
  })
})

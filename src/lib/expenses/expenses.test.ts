import { describe, expect, it, vi } from 'vitest'
import {
  createHouseholdWithMembership,
  getOrCreateHouseholdInvite,
  HouseholdAccessDeniedError,
  joinHousehold,
  leaveHousehold,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { colorForCategoryName } from './categoryColor'
import {
  createExpense,
  deleteExpense,
  ExpenseNotFoundError,
  findOrCreateCategory,
  listCategories,
  listExpensesInMonth,
  listRecentExpenses,
  updateExpense,
} from './expenses'

describe('listCategories after household create', () => {
  it('seeds the six default category names for that household only', async () => {
    const store = createMemoryHouseholdsDb()
    const first = await createHouseholdWithMembership({
      db: store.asUser('user-1'),
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const second = await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    const firstCategories = await listCategories({
      db: store.asUser('user-1'),
      householdId: first.id,
    })
    const secondCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: second.id,
    })

    expect(firstCategories.map((category) => category.name)).toEqual([
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
    ])
    expect(firstCategories).toHaveLength(6)
    expect(
      firstCategories.every((category) => category.householdId === first.id),
    ).toBe(true)
    expect(secondCategories.map((category) => category.name)).toEqual([
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
    ])
    expect(
      secondCategories.every((category) => category.householdId === second.id),
    ).toBe(true)
    expect(new Set(firstCategories.map((category) => category.id)).size).toBe(6)
  })
})

describe('findOrCreateCategory', () => {
  it('resolves a trimmed case-insensitive name to the seeded category', async () => {
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

    const resolved = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: '  comida  ',
    })

    expect(resolved.id).toBe(comida.id)
    expect(resolved.name).toBe('Comida')
    expect(resolved.householdId).toBe(household.id)
    const after = await listCategories({ db, householdId: household.id })
    expect(after).toHaveLength(6)
  })

  it('creates a new category that another member can list afterward', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const memberDb = store.asUser('user-2')

    const created = await findOrCreateCategory({
      db: ownerDb,
      householdId: household.id,
      name: 'Regalos',
    })

    expect(created.name).toBe('Regalos')
    expect(created.householdId).toBe(household.id)
    const listed = await listCategories({
      db: memberDb,
      householdId: household.id,
    })
    const fromList = listed.find((category) => category.name === 'Regalos')
    expect(fromList).toEqual(created)
  })

  it('assigns the deterministic hash color to a newly created category', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const created = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Regalos',
    })

    expect(created.color).toBe(colorForCategoryName('Regalos'))
  })

  it('returns the same stored color both times an existing name is resolved', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const first = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Regalos',
    })
    const second = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: '  REGALOS  ',
    })

    expect(first.color).toBe(second.color)
    expect(second.color).toBe(colorForCategoryName('Regalos'))
  })

  it('returns one category when two members create the same new name in parallel', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const memberDb = store.asUser('user-2')

    const [first, second] = await Promise.all([
      findOrCreateCategory({
        db: ownerDb,
        householdId: household.id,
        name: 'Regalos',
      }),
      findOrCreateCategory({
        db: memberDb,
        householdId: household.id,
        name: '  regalos  ',
      }),
    ])

    expect(first.id).toBe(second.id)
    expect(first.name).toBe(second.name)
    const listed = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    expect(
      listed.filter((category) => category.name.toLowerCase() === 'regalos'),
    ).toHaveLength(1)
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
    const strangerDb = store.asUser('user-2')

    await expect(
      findOrCreateCategory({
        db: strangerDb,
        householdId: household.id,
        name: 'Regalos',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('denies a member of another household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    await expect(
      findOrCreateCategory({
        db: store.asUser('user-2'),
        householdId: household.id,
        name: 'Regalos',
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('rejects a blank category name before writing', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      findOrCreateCategory({
        db,
        householdId: household.id,
        name: '   ',
      }),
    ).rejects.toThrow('El nombre de la categoría no puede estar vacío')

    const after = await listCategories({ db, householdId: household.id })
    expect(after).toHaveLength(6)
  })

  it('keeps the original display name when the same new name is typed again', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const created = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Regalos',
    })
    const again = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'REGALOS',
    })

    expect(again).toEqual(created)
    expect(again.name).toBe('Regalos')
  })
})

describe('createExpense', () => {
  it('stores a positive price rounded to 2 decimals with member and category ids', async () => {
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
    const expenseDate = new Date(2026, 7, 15)

    const expense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10.456,
      comments: 'Friday dinner',
      expenseDate,
    })

    expect(expense).toEqual({
      id: expect.any(String),
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10.46,
      comments: 'Friday dinner',
      expenseDate,
      createdAt: expect.any(Date),
    })
    expect(expense.id.length).toBeGreaterThan(0)
  })

  it('rejects an empty name, a non-positive price, and a future expense date', async () => {
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
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: '   ',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow('El nombre del gasto no puede estar vacío')

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 0,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow('El precio del gasto debe ser un número positivo')

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: tomorrow,
      }),
    ).rejects.toThrow('La fecha del gasto no puede ser futura')

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: '  ',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow('El nombre del autor no puede estar vacío')
  })

  it('rejects an unknown category and a different member as author', async () => {
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
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: 'missing-category',
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow('Category not found')

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-2',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('rejects a category that belongs to another household', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
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
    const otherComida = otherCategories.find(
      (category) => category.name === 'Comida',
    )
    expect(otherComida).toBeDefined()
    if (otherComida === undefined) {
      throw new Error('expected Comida category')
    }

    await expect(
      createExpense({
        db,
        householdId: household.id,
        categoryId: otherComida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow('Category not found')
  })

  it('trims the expense name and allows empty comments', async () => {
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

    const expense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: '  Pizza  ',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    expect(expense.name).toBe('Pizza')
    expect(expense.comments).toBe('')
  })
})

describe('listExpensesInMonth', () => {
  it('returns only expenses in the inclusive month range for that household', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
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
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    const otherCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: other.id,
    })
    const otherComida = otherCategories.find(
      (category) => category.name === 'Comida',
    )
    expect(comida).toBeDefined()
    expect(otherComida).toBeDefined()
    if (comida === undefined || otherComida === undefined) {
      throw new Error('expected Comida category')
    }

    const inMonth = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'July rent',
      price: 20,
      comments: '',
      expenseDate: new Date(2026, 6, 31),
    })
    await createExpense({
      db: store.asUser('user-2'),
      householdId: other.id,
      categoryId: otherComida.id,
      memberId: 'user-2',
      authorDisplayName: 'Bob',
      name: 'Other pizza',
      price: 30,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    const listed = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed).toEqual([inMonth])
  })

  it('orders expenses by date newest first', async () => {
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

    const earlier = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Earlier',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 10),
    })
    const later = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Later',
      price: 20,
      comments: '',
      expenseDate: new Date(2026, 7, 20),
    })

    const listed = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed.map((expense) => expense.id)).toEqual([later.id, earlier.id])
  })

  it('returns an empty list when the household has no expenses in range', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      listExpensesInMonth({
        db,
        householdId: household.id,
        monthStart: new Date(2026, 7, 1),
        monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
      }),
    ).resolves.toEqual([])
  })

  it('still returns the stored author display name after the author leaves the household', async () => {
    const store = createMemoryHouseholdsDb()
    const authorDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: authorDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })
    const remainingDb = store.asUser('user-2')
    const categories = await listCategories({
      db: remainingDb,
      householdId: household.id,
    })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db: authorDb,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    await leaveHousehold({ db: authorDb, userId: 'user-1' })

    const listed = await listExpensesInMonth({
      db: remainingDb,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed).toHaveLength(1)
    expect(listed[0]?.authorDisplayName).toBe('Ada')
  })
})

describe('listRecentExpenses', () => {
  it('returns expenses across all months, newest first', async () => {
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

    const older = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Old rent',
      price: 40,
      comments: '',
      expenseDate: new Date(2026, 5, 1),
    })
    const newer = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    const listed = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })

    expect(listed.map((expense) => expense.id)).toEqual([newer.id, older.id])
  })

  it('caps the result at the given limit', async () => {
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

    for (let day = 1; day <= 12; day += 1) {
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: `Expense ${String(day)}`,
        price: 5,
        comments: '',
        expenseDate: new Date(2026, 6, day),
      })
    }

    const listed = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })

    expect(listed).toHaveLength(10)
  })

  it('returns exactly limit expenses when the household has exactly limit', async () => {
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

    for (let day = 1; day <= 10; day += 1) {
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: `Expense ${String(day)}`,
        price: 5,
        comments: '',
        expenseDate: new Date(2026, 6, day),
      })
    }

    const listed = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })

    expect(listed).toHaveLength(10)
  })

  it('breaks a tie on expense_date by createdAt, newest first', async () => {
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
    const sameDay = new Date(2026, 6, 15)

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 6, 15, 9, 0, 0))
      const createdFirst = await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Created earlier',
        price: 5,
        comments: '',
        expenseDate: sameDay,
      })

      vi.setSystemTime(new Date(2026, 6, 15, 15, 0, 0))
      const createdSecond = await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Created later',
        price: 5,
        comments: '',
        expenseDate: sameDay,
      })

      const listed = await listRecentExpenses({
        db,
        householdId: household.id,
        limit: 10,
      })

      expect(listed.map((expense) => expense.id)).toEqual([
        createdSecond.id,
        createdFirst.id,
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns an empty list for a household with no expenses at all', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      listRecentExpenses({ db, householdId: household.id, limit: 10 }),
    ).resolves.toEqual([])
  })

  it('does not include another household expenses', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
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
    await createExpense({
      db: store.asUser('user-2'),
      householdId: other.id,
      categoryId: otherComida.id,
      memberId: 'user-2',
      authorDisplayName: 'Bob',
      name: 'Other pizza',
      price: 30,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    const listed = await listRecentExpenses({
      db,
      householdId: household.id,
      limit: 10,
    })

    expect(listed).toEqual([])
  })
})

describe('updateExpense author display name', () => {
  it('preserves the stored author display name when another member edits the expense', async () => {
    const store = createMemoryHouseholdsDb()
    const authorDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: authorDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })
    const editorDb = store.asUser('user-2')
    const categories = await listCategories({
      db: editorDb,
      householdId: household.id,
    })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    const expense = await createExpense({
      db: authorDb,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    await leaveHousehold({ db: authorDb, userId: 'user-1' })

    const updated = await updateExpense({
      db: editorDb,
      expenseId: expense.id,
      householdId: household.id,
      name: 'Updated pizza',
      price: 12,
      categoryId: comida.id,
      comments: 'extra cheese',
      expenseDate: new Date(2026, 7, 16),
      now: augustNow,
    })

    expect(updated.authorDisplayName).toBe('Ada')
    expect(updated.memberId).toBe('user-1')
    expect(updated.name).toBe('Updated pizza')

    const listed = await listExpensesInMonth({
      db: editorDb,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })

    expect(listed[0]?.authorDisplayName).toBe('Ada')
  })

  it('rejects updating a missing expense', async () => {
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
      updateExpense({
        db,
        expenseId: 'missing-expense',
        householdId: household.id,
        name: 'Pizza',
        price: 10,
        categoryId: comida.id,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow(ExpenseNotFoundError)
  })
})

describe('deleteExpense', () => {
  it('permanently removes an existing expense from storage', async () => {
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
    const expenseDate = new Date(2026, 7, 15)
    const expense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate,
    })

    await deleteExpense({
      db,
      householdId: household.id,
      expenseId: expense.id,
    })

    const listed = await listExpensesInMonth({
      db,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })
    expect(listed).toEqual([])
  })

  it('returns ExpenseNotFoundError when the expense was already deleted', async () => {
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
    const expense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    const [first, second] = await Promise.allSettled([
      deleteExpense({
        db,
        householdId: household.id,
        expenseId: expense.id,
      }),
      deleteExpense({
        db,
        householdId: household.id,
        expenseId: expense.id,
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
    expect(rejected[0]?.reason).toBeInstanceOf(ExpenseNotFoundError)
  })

  it('lets any household member delete an expense regardless of author', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const memberDb = store.asUser('user-2')
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }
    const expense = await createExpense({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })

    await deleteExpense({
      db: memberDb,
      householdId: household.id,
      expenseId: expense.id,
    })

    const listed = await listExpensesInMonth({
      db: ownerDb,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })
    expect(listed).toEqual([])
  })

  it('returns ExpenseNotFoundError for an unknown expense id', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    await expect(
      deleteExpense({
        db,
        householdId: household.id,
        expenseId: 'missing-expense',
      }),
    ).rejects.toThrow(ExpenseNotFoundError)
  })

  it('denies delete for a non-member and hides another household expense id', async () => {
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
    const otherCategories = await listCategories({
      db: store.asUser('user-2'),
      householdId: other.id,
    })
    const comida = categories[0]
    const otherComida = otherCategories[0]
    expect(comida).toBeDefined()
    expect(otherComida).toBeDefined()
    if (comida === undefined || otherComida === undefined) {
      throw new Error('expected seeded categories')
    }
    const otherExpense = await createExpense({
      db: store.asUser('user-2'),
      householdId: other.id,
      categoryId: otherComida.id,
      memberId: 'user-2',
      authorDisplayName: 'Bob',
      name: 'Other pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 15),
    })
    const strangerDb = store.asUser('user-3')

    await expect(
      deleteExpense({
        db: strangerDb,
        householdId: household.id,
        expenseId: otherExpense.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      deleteExpense({
        db: ownerDb,
        householdId: household.id,
        expenseId: otherExpense.id,
      }),
    ).rejects.toThrow(ExpenseNotFoundError)
  })
})

describe('expense access', () => {
  it('denies list and create for a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const strangerDb = store.asUser('user-2')
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories[0]
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected a seeded category')
    }

    await expect(
      listCategories({ db: strangerDb, householdId: household.id }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      createExpense({
        db: strangerDb,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-2',
        authorDisplayName: 'Eve',
        name: 'Pizza',
        price: 10,
        comments: '',
        expenseDate: new Date(2026, 7, 15),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    await expect(
      listExpensesInMonth({
        db: strangerDb,
        householdId: household.id,
        monthStart: new Date(2026, 7, 1),
        monthEnd: new Date(2026, 7, 31),
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('denies a member of another household and lets a joined member read seeded categories', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await createHouseholdWithMembership({
      db: store.asUser('user-2'),
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 200,
    })

    await expect(
      listCategories({
        db: store.asUser('user-2'),
        householdId: household.id,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)

    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-3')
    await joinHousehold({
      db: joinerDb,
      userId: 'user-3',
      token: invite.token,
    })

    const categories = await listCategories({
      db: joinerDb,
      householdId: household.id,
    })
    expect(categories.map((category) => category.name)).toEqual([
      'Comida',
      'Transporte',
      'Servicios',
      'Entretenimiento',
      'Salud',
      'Otros',
    ])
  })
})

const augustNow = new Date(2026, 7, 28, 12, 0, 0)

async function seedAugustExpense(input: {
  readonly store: ReturnType<typeof createMemoryHouseholdsDb>
  readonly authorUserId?: string
  readonly editorUserId?: string
}): Promise<{
  readonly household: Awaited<ReturnType<typeof createHouseholdWithMembership>>
  readonly expense: Awaited<ReturnType<typeof createExpense>>
  readonly comida: { readonly id: string; readonly name: string }
  readonly transporte: { readonly id: string; readonly name: string }
  readonly editorDb: ReturnType<
    ReturnType<typeof createMemoryHouseholdsDb>['asUser']
  >
}> {
  const authorUserId = input.authorUserId ?? 'user-1'
  const editorUserId = input.editorUserId ?? authorUserId
  const ownerDb = input.store.asUser(authorUserId)
  const household = await createHouseholdWithMembership({
    db: ownerDb,
    userId: authorUserId,
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  if (editorUserId !== authorUserId) {
    input.store.seedMembership({
      userId: editorUserId,
      householdId: household.id,
    })
  }
  const categories = await listCategories({
    db: ownerDb,
    householdId: household.id,
  })
  const comida = categories.find((category) => category.name === 'Comida')
  const transporte = categories.find(
    (category) => category.name === 'Transporte',
  )
  expect(comida).toBeDefined()
  expect(transporte).toBeDefined()
  if (comida === undefined || transporte === undefined) {
    throw new Error('expected seeded categories')
  }
  const expense = await createExpense({
    db: ownerDb,
    householdId: household.id,
    categoryId: comida.id,
    memberId: authorUserId,
    authorDisplayName: 'Ada',
    name: 'Pizza',
    price: 10,
    comments: 'Friday dinner',
    expenseDate: new Date(2026, 7, 15),
  })
  return {
    household,
    expense,
    comida,
    transporte,
    editorDb: input.store.asUser(editorUserId),
  }
}

describe('updateExpense', () => {
  it('updates all fields together with the same validation as create', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, transporte, editorDb } =
      await seedAugustExpense({
        store,
      })
    const newDate = new Date(2026, 7, 20)

    const updated = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      name: '  Bus ticket  ',
      price: 12.345,
      categoryId: transporte.id,
      comments: 'Commute',
      expenseDate: newDate,
      now: augustNow,
    })

    expect(updated).toEqual({
      ...expense,
      name: 'Bus ticket',
      price: 12.35,
      categoryId: transporte.id,
      comments: 'Commute',
      expenseDate: newDate,
    })
  })

  it('updates each field independently and leaves the rest unchanged', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, transporte, editorDb } =
      await seedAugustExpense({
        store,
      })

    const renamed = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      name: 'Lunch',
      now: augustNow,
    })
    expect(renamed.name).toBe('Lunch')
    expect(renamed.price).toBe(expense.price)
    expect(renamed.categoryId).toBe(expense.categoryId)
    expect(renamed.comments).toBe(expense.comments)
    expect(renamed.expenseDate).toEqual(expense.expenseDate)

    const repriced = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      price: 15.5,
      now: augustNow,
    })
    expect(repriced.price).toBe(15.5)
    expect(repriced.name).toBe('Lunch')

    const recategorized = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      categoryId: transporte.id,
      now: augustNow,
    })
    expect(recategorized.categoryId).toBe(transporte.id)

    const recommented = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      comments: 'Updated note',
      now: augustNow,
    })
    expect(recommented.comments).toBe('Updated note')

    const redated = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      expenseDate: new Date(2026, 7, 10),
      now: augustNow,
    })
    expect(redated.expenseDate).toEqual(new Date(2026, 7, 10))
    expect(redated.memberId).toBe(expense.memberId)
    expect(redated.authorDisplayName).toBe(expense.authorDisplayName)
  })

  it('rejects empty name, non-positive price, and a future expense date', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({ store })
    const tomorrow = new Date(2026, 7, 29)

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        name: '   ',
        now: augustNow,
      }),
    ).rejects.toThrow('El nombre del gasto no puede estar vacío')

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        price: 0,
        now: augustNow,
      }),
    ).rejects.toThrow('El precio del gasto debe ser un número positivo')

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        expenseDate: tomorrow,
        now: augustNow,
      }),
    ).rejects.toThrow('La fecha del gasto no puede ser futura')

    const unchanged = await editorDb.getExpense({
      householdId: household.id,
      expenseId: expense.id,
    })
    expect(unchanged).toEqual(expense)
  })

  it('rejects a blank category name before writing', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({ store })

    await expect(
      findOrCreateCategory({
        db: editorDb,
        householdId: household.id,
        name: '   ',
      }),
    ).rejects.toThrow('El nombre de la categoría no puede estar vacío')

    const unchanged = await editorDb.getExpense({
      householdId: household.id,
      expenseId: expense.id,
    })
    expect(unchanged).toEqual(expense)
  })

  it('rejects a date edit that moves the expense outside the current calendar month and leaves it unchanged', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({ store })

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        expenseDate: new Date(2026, 6, 31),
        now: augustNow,
      }),
    ).rejects.toThrow('La fecha del gasto debe ser del mes actual')

    const unchanged = await editorDb.getExpense({
      householdId: household.id,
      expenseId: expense.id,
    })
    expect(unchanged).toEqual(expense)
  })

  it('succeeds when a different household member edits an expense they did not author', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({
      store,
      authorUserId: 'user-1',
      editorUserId: 'user-2',
    })

    const updated = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      name: 'Shared edit',
      now: augustNow,
    })

    expect(updated.name).toBe('Shared edit')
    expect(updated.memberId).toBe('user-1')
    expect(updated.authorDisplayName).toBe('Ada')
  })

  it('rejects editing an expense that is not in the current calendar month', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
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
    const julyExpense = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'July lunch',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 6, 15),
    })

    await expect(
      updateExpense({
        db,
        householdId: household.id,
        expenseId: julyExpense.id,
        name: 'Too late',
        now: augustNow,
      }),
    ).rejects.toThrow('El gasto no pertenece al mes actual')

    const unchanged = await db.getExpense({
      householdId: household.id,
      expenseId: julyExpense.id,
    })
    expect(unchanged).toEqual(julyExpense)
  })

  it('rejects an unknown category, a missing expense, and a non-member', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({ store })

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        categoryId: 'missing-category',
        now: augustNow,
      }),
    ).rejects.toThrow('Category not found')

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: 'missing-expense',
        name: 'Ghost',
        now: augustNow,
      }),
    ).rejects.toThrow(ExpenseNotFoundError)

    await expect(
      updateExpense({
        db: store.asUser('user-3'),
        householdId: household.id,
        expenseId: expense.id,
        name: 'Intruder',
        now: augustNow,
      }),
    ).rejects.toThrow(HouseholdAccessDeniedError)
  })

  it('returns ExpenseNotFoundError when another member deleted the expense before edit', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({
      store,
      authorUserId: 'user-1',
      editorUserId: 'user-1',
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })

    await deleteExpense({
      db: store.asUser('user-2'),
      householdId: household.id,
      expenseId: expense.id,
    })

    await expect(
      updateExpense({
        db: editorDb,
        householdId: household.id,
        expenseId: expense.id,
        name: 'Stale edit',
        now: augustNow,
      }),
    ).rejects.toMatchObject({
      name: 'ExpenseNotFoundError',
      code: 'EXPENSE_NOT_FOUND',
    })

    const listed = await listExpensesInMonth({
      db: editorDb,
      householdId: household.id,
      monthStart: new Date(2026, 7, 1),
      monthEnd: new Date(2026, 7, 31, 23, 59, 59, 999),
    })
    expect(listed).toEqual([])
  })

  it('resolves a trimmed case-insensitive category name via findOrCreateCategory before updating', async () => {
    const store = createMemoryHouseholdsDb()
    const { household, expense, editorDb } = await seedAugustExpense({ store })

    const resolved = await findOrCreateCategory({
      db: editorDb,
      householdId: household.id,
      name: '  transporte  ',
    })
    const updated = await updateExpense({
      db: editorDb,
      householdId: household.id,
      expenseId: expense.id,
      categoryId: resolved.id,
      now: augustNow,
    })

    expect(updated.categoryId).toBe(resolved.id)
    expect(resolved.name).toBe('Transporte')
  })
})

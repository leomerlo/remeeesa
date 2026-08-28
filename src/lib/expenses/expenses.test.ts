import { describe, expect, it } from 'vitest'
import {
  createHouseholdWithMembership,
  getOrCreateHouseholdInvite,
  HouseholdAccessDeniedError,
  joinHousehold,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { createExpense, listCategories, listExpensesInMonth } from './expenses'

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
    ).rejects.toThrow('Expense name must be non-empty')

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
    ).rejects.toThrow('Expense price must be a positive number')

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
    ).rejects.toThrow('Expense date cannot be in the future')

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
    ).rejects.toThrow('Author display name must be non-empty')
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

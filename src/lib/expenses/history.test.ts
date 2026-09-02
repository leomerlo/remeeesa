import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import type { HouseholdsDb } from '@/lib/households'
import { createExpense, listCategories, listExpenseHistoryPage } from './index'
import { monthEndOf, monthStartOf } from './history'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

async function seed(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly date: Date
}) {
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: input.name,
    price: 10,
    comments: '',
    expenseDate: input.date,
  })
}

describe('monthStartOf / monthEndOf', () => {
  it('brackets the calendar month the date falls in', () => {
    const inside = new Date(2026, 7, 17, 13, 45)
    expect(monthStartOf(inside)).toEqual(new Date(2026, 7, 1))
    expect(monthEndOf(inside)).toEqual(new Date(2026, 7, 31, 23, 59, 59, 999))
  })

  it('handles February in a leap year', () => {
    expect(monthEndOf(new Date(2028, 1, 3))).toEqual(
      new Date(2028, 1, 29, 23, 59, 59, 999),
    )
  })
})

describe('listExpenseHistoryPage', () => {
  it('returns an empty page with no cursor for a household with no expenses', async () => {
    const { db, householdId } = await seedHousehold()

    const page = await listExpenseHistoryPage({ db, householdId })

    expect(page.expenses).toEqual([])
    expect(page.nextBeforeMonthStart).toBeNull()
  })

  it('returns one whole calendar month, newest first, per page', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Ago 3',
      date: new Date(2026, 7, 3),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Ago 20',
      date: new Date(2026, 7, 20),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Jul 9',
      date: new Date(2026, 6, 9),
    })

    const first = await listExpenseHistoryPage({ db, householdId })

    // August only, newest-first within the month.
    expect(first.expenses.map((expense) => expense.name)).toEqual([
      'Ago 20',
      'Ago 3',
    ])
    expect(first.nextBeforeMonthStart).toEqual(new Date(2026, 7, 1))
  })

  it('walks month by month through the cursor, and reports the end', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Ago',
      date: new Date(2026, 7, 3),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Jul',
      date: new Date(2026, 6, 9),
    })

    const first = await listExpenseHistoryPage({ db, householdId })
    const second = await listExpenseHistoryPage({
      db,
      householdId,
      ...(first.nextBeforeMonthStart === null
        ? {}
        : { beforeMonthStart: first.nextBeforeMonthStart }),
    })

    expect(second.expenses.map((expense) => expense.name)).toEqual(['Jul'])
    // Nothing older than July, so the caller can stop offering "load more".
    expect(second.nextBeforeMonthStart).toBeNull()
  })

  // The AC's awkward case: a month holding far more expenses than a
  // fixed-size page would fit. Because a page is defined as a calendar
  // month rather than a row count, the month simply arrives whole -- it is
  // never split across two pages, which is what lets the screen render its
  // month header once.
  it('keeps a month whole even when it holds an unusual number of expenses', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= 28; day += 1) {
      await seed({
        db,
        householdId,
        categoryId,
        name: `Ago ${String(day)}`,
        date: new Date(2026, 7, day),
      })
    }
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Jul',
      date: new Date(2026, 6, 9),
    })

    const first = await listExpenseHistoryPage({ db, householdId })

    expect(first.expenses).toHaveLength(28)
    expect(
      first.expenses.every((expense) => expense.expenseDate.getMonth() === 7),
    ).toBe(true)
    expect(first.nextBeforeMonthStart).toEqual(new Date(2026, 7, 1))
  })

  // A household that spent nothing for several months should not need one
  // round trip per empty month to reach the next month that has data.
  it('jumps straight over months with no expenses', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Ago',
      date: new Date(2026, 7, 3),
    })
    await seed({
      db,
      householdId,
      categoryId,
      name: 'Mar',
      date: new Date(2026, 2, 15),
    })

    const first = await listExpenseHistoryPage({ db, householdId })
    const second = await listExpenseHistoryPage({
      db,
      householdId,
      ...(first.nextBeforeMonthStart === null
        ? {}
        : { beforeMonthStart: first.nextBeforeMonthStart }),
    })

    expect(second.expenses.map((expense) => expense.name)).toEqual(['Mar'])
    expect(second.nextBeforeMonthStart).toBeNull()
  })

  it('never leaks another household expenses', async () => {
    const store = createMemoryHouseholdsDb()
    const mine = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: mine,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const theirs = store.asUser('user-2')
    const other = await createHouseholdWithMembership({
      db: theirs,
      userId: 'user-2',
      name: 'Otra Casa',
      monthlyBudget: 100,
    })
    const mineCategories = await listCategories({
      db: mine,
      householdId: household.id,
    })
    const theirCategories = await listCategories({
      db: theirs,
      householdId: other.id,
    })
    const mineCategory = mineCategories[0]
    const theirCategory = theirCategories[0]
    if (mineCategory === undefined || theirCategory === undefined) {
      throw new Error('expected seeded categories')
    }
    await seed({
      db: mine,
      householdId: household.id,
      categoryId: mineCategory.id,
      name: 'Mio',
      date: new Date(2026, 7, 3),
    })
    await createExpense({
      db: theirs,
      householdId: other.id,
      categoryId: theirCategory.id,
      memberId: 'user-2',
      authorDisplayName: 'Bob',
      name: 'Ajeno',
      price: 10,
      comments: '',
      expenseDate: new Date(2026, 7, 4),
    })

    const page = await listExpenseHistoryPage({
      db: mine,
      householdId: household.id,
    })

    expect(page.expenses.map((expense) => expense.name)).toEqual(['Mio'])
  })
})

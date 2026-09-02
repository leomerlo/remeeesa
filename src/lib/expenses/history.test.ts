import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import type { HouseholdsDb } from '@/lib/households'
import { createExpense, listCategories, listExpenseHistoryPage } from './index'
import { buildExpenseHistoryPage, EXPENSE_HISTORY_PAGE_SIZE } from './history'

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

// A newest-first fixture list where item N is N ms older than item 0 --
// buildExpenseHistoryPage only cares about relative order and count, so a
// synthetic list is enough to exercise it without a database.
function fixtureExpenses(count: number) {
  const base = new Date(2026, 7, 1).getTime()
  return Array.from({ length: count }, (_, index) => ({
    id: `expense-${String(index)}`,
    householdId: 'h1',
    categoryId: 'c1',
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: `Expense ${String(index)}`,
    price: 10,
    comments: '',
    expenseDate: new Date(base - index * 1000),
    pendienteId: null,
    createdAt: new Date(base - index * 1000),
  }))
}

describe('buildExpenseHistoryPage', () => {
  it('returns an empty page with no cursor for an empty list', () => {
    expect(buildExpenseHistoryPage([])).toEqual({
      expenses: [],
      nextCursor: null,
    })
  })

  it('returns everything with no cursor when there are fewer than a full page', () => {
    const fixture = fixtureExpenses(EXPENSE_HISTORY_PAGE_SIZE - 3)

    const page = buildExpenseHistoryPage(fixture)

    expect(page.expenses).toHaveLength(fixture.length)
    expect(page.nextCursor).toBeNull()
  })

  it('caps a page at EXPENSE_HISTORY_PAGE_SIZE and returns a cursor for the rest', () => {
    const fixture = fixtureExpenses(EXPENSE_HISTORY_PAGE_SIZE + 5)

    const page = buildExpenseHistoryPage(fixture)

    expect(page.expenses).toHaveLength(EXPENSE_HISTORY_PAGE_SIZE)
    expect(page.expenses).toEqual(fixture.slice(0, EXPENSE_HISTORY_PAGE_SIZE))
    const lastOnPage = fixture[EXPENSE_HISTORY_PAGE_SIZE - 1]
    expect(page.nextCursor).toEqual({
      expenseDate: lastOnPage?.expenseDate,
      createdAt: lastOnPage?.createdAt,
    })
  })

  it('returns exactly one full page with no cursor when the count matches the page size exactly', () => {
    const fixture = fixtureExpenses(EXPENSE_HISTORY_PAGE_SIZE)

    const page = buildExpenseHistoryPage(fixture)

    expect(page.expenses).toHaveLength(EXPENSE_HISTORY_PAGE_SIZE)
    expect(page.nextCursor).toBeNull()
  })
})

describe('listExpenseHistoryPage', () => {
  it('returns an empty page with no cursor for a household with no expenses', async () => {
    const { db, householdId } = await seedHousehold()

    const page = await listExpenseHistoryPage({ db, householdId })

    expect(page.expenses).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  it('returns up to a fixed page size, newest first, regardless of month', async () => {
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

    const page = await listExpenseHistoryPage({ db, householdId })

    // All three fit on one page even though they span two months -- a page
    // is a row count, not a calendar boundary.
    expect(page.expenses.map((expense) => expense.name)).toEqual([
      'Ago 20',
      'Ago 3',
      'Jul 9',
    ])
    expect(page.nextCursor).toBeNull()
  })

  it('walks through the cursor a fixed page at a time, and reports the end', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= EXPENSE_HISTORY_PAGE_SIZE + 3; day += 1) {
      await seed({
        db,
        householdId,
        categoryId,
        name: `Day ${String(day)}`,
        date: new Date(2026, 7, day),
      })
    }

    const first = await listExpenseHistoryPage({ db, householdId })
    expect(first.expenses).toHaveLength(EXPENSE_HISTORY_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()

    const second = await listExpenseHistoryPage({
      db,
      householdId,
      ...(first.nextCursor === null ? {} : { after: first.nextCursor }),
    })

    // The remaining 3, newest-first, with nothing left after.
    expect(second.expenses).toHaveLength(3)
    expect(second.nextCursor).toBeNull()
    // No overlap and no gap between the two pages.
    const allNames = [...first.expenses, ...second.expenses].map(
      (expense) => expense.name,
    )
    expect(new Set(allNames).size).toBe(EXPENSE_HISTORY_PAGE_SIZE + 3)
  })

  // A month holding far more expenses than a page fits used to arrive whole
  // in one page; now it simply spans two (or more) pages, same as any other
  // stretch of history.
  it('splits a single busy month across pages rather than growing the page', async () => {
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

    const first = await listExpenseHistoryPage({ db, householdId })

    expect(first.expenses).toHaveLength(EXPENSE_HISTORY_PAGE_SIZE)
    expect(first.nextCursor).not.toBeNull()
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

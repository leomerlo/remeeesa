import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  leaveHousehold,
  updateMemberDisplayName,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { RecentExpensesList } from './RecentExpensesList'

function currentMonthDate(day: number): Date {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(day, now.getDate()),
  )
}

function lastMonthDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 15)
}

function formatExpenseDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

describe('RecentExpensesList', () => {
  it('shows an empty state when the household has no expenses at all', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const { container } = renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeNull()
  })

  it('lists recent expenses with name, price, category, date, and author, newest first', async () => {
    const realNow = new Date()
    const fixedNow = new Date(
      realNow.getFullYear(),
      realNow.getMonth(),
      28,
      12,
      0,
      0,
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedNow)

    try {
      const store = createMemoryHouseholdsDb()
      const db = store.asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
        displayName: 'Ada',
      })
      store.seedMembership({
        userId: 'user-2',
        householdId: household.id,
        displayName: 'Bob',
      })
      const categories = await listCategories({
        db,
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

      const earlierDate = currentMonthDate(1)
      const laterDate = currentMonthDate(28)
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 12.5,
        comments: '',
        expenseDate: earlierDate,
      })
      await createExpense({
        db: store.asUser('user-2'),
        householdId: household.id,
        categoryId: transporte.id,
        memberId: 'user-2',
        authorDisplayName: 'Bob',
        name: 'Taxi',
        price: 8.25,
        comments: '',
        expenseDate: laterDate,
      })

      renderWithProviders(
        <RecentExpensesList db={db} householdId={household.id} />,
      )

      const rows = await screen.findAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Taxi')
      expect(rows[0]).toHaveTextContent('$8,25')
      expect(rows[0]).toHaveTextContent('Transporte')
      expect(rows[0]).toHaveTextContent(formatExpenseDate(laterDate))
      expect(rows[0]).toHaveTextContent('Bob')
      expect(rows[1]).toHaveTextContent('Pizza')
      expect(rows[1]).toHaveTextContent('$12,50')
      expect(rows[1]).toHaveTextContent('Comida')
      expect(rows[1]).toHaveTextContent(formatExpenseDate(earlierDate))
      expect(rows[1]).toHaveTextContent('Ada')
      expect(
        screen.queryByText('Todavía no hay gastos este mes'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scoped to the current month, not all-time: a household mid-way through
  // an active month with nothing yet logged should see the empty state, not
  // last month's movements standing in for it.
  it('excludes an expense dated last month and shows the empty state instead', async () => {
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

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Old rent',
      price: 40,
      comments: '',
      expenseDate: lastMonthDate(),
    })

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Old rent')).not.toBeInTheDocument()
  })

  it('caps the list at the 10 most recent expenses', async () => {
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

    // All dated "now" (today, current month) rather than spread across 12
    // distinct days -- the household's calendar could be early enough in
    // the month that 12 distinct valid days don't exist yet. Creation
    // order (expense_date/created_at desc) still gives a stable "most
    // recent 10" without depending on the day of the month this test runs.
    for (let i = 1; i <= 12; i += 1) {
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: `Expense ${String(i)}`,
        price: 5,
        comments: '',
        expenseDate: new Date(),
      })
    }

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(10)
  })

  it('shows the stored author display name after the author leaves the household', async () => {
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
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    await leaveHousehold({ db: authorDb, userId: 'user-1' })

    renderWithProviders(
      <RecentExpensesList db={remainingDb} householdId={household.id} />,
    )

    const row = await screen.findByRole('listitem')
    expect(row).toHaveTextContent('Pizza')
    expect(row).toHaveTextContent('$12,50')
    expect(row).toHaveTextContent('Ada')
  })

  // Regression: authorDisplayName is a snapshot taken when the expense was
  // created, so it used to go stale the moment a member corrected their name
  // in Ajustes -- old rows kept showing the name they'd since changed away
  // from. The row must reflect the member's *current* name, not the one
  // frozen on the expense.
  it("shows the member's current display name, not the stale one stored on the expense", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Florencia Sepúlveda',
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Florencia Sepúlveda',
      name: 'Veterinario',
      price: 9000,
      comments: '',
      expenseDate: new Date(),
    })

    await updateMemberDisplayName({
      db,
      householdId: household.id,
      userId: 'user-1',
      displayName: 'Jlors',
    })

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    const row = await screen.findByRole('listitem')
    expect(row).toHaveTextContent('Jlors')
    expect(row).not.toHaveTextContent('Florencia Sepúlveda')
  })

  // Matches the approved comp: rows are plain, buttonless cards -- tapping
  // one is the only affordance, and it opens the expense for editing.
  // Deleting lives inside that edit form (AddExpenseForm.tsx), not here.
  it('opens a row for editing when tapped', async () => {
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

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })

    let editedName: string | null = null
    let editedCategoryName: string | null = null
    renderWithProviders(
      <RecentExpensesList
        db={db}
        householdId={household.id}
        onEditExpense={(expense, categoryName) => {
          editedName = expense.name
          editedCategoryName = categoryName
        }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))

    expect(editedName).toBe('Pizza')
    expect(editedCategoryName).toBe('Comida')
  })

  // No onEditExpense means no way to act on a tap, so the row degrades to a
  // plain non-interactive card rather than a button that does nothing.
  it('renders a plain (non-button) row when onEditExpense is not provided', async () => {
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

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar Pizza' }),
    ).not.toBeInTheDocument()
  })

  it("fills each expense's leading icon with its category color", async () => {
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

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    const row = await screen.findByRole('listitem')
    const icon = row.querySelector('[data-testid="category-icon"]')
    expect(icon).not.toBeNull()
    expect(icon).toHaveStyle({ backgroundColor: comida.color })
  })

  it('shows an error when the current user is not a household member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <RecentExpensesList
        db={store.asUser('user-2')}
        householdId={household.id}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo los integrantes del hogar pueden acceder a este hogar',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

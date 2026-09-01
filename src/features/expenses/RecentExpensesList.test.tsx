import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, deleteExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership, leaveHousehold } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { RecentExpensesList } from './RecentExpensesList'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

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

    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
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
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
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
        db,
        householdId: household.id,
        categoryId: transporte.id,
        memberId: 'user-1',
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
      expect(rows[0]).toHaveTextContent('8.25')
      expect(rows[0]).toHaveTextContent('Transporte')
      expect(rows[0]).toHaveTextContent(formatExpenseDate(laterDate))
      expect(rows[0]).toHaveTextContent('Bob')
      expect(rows[1]).toHaveTextContent('Pizza')
      expect(rows[1]).toHaveTextContent('12.50')
      expect(rows[1]).toHaveTextContent('Comida')
      expect(rows[1]).toHaveTextContent(formatExpenseDate(earlierDate))
      expect(rows[1]).toHaveTextContent('Ada')
      expect(
        screen.queryByText('Todavía no hay gastos'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('includes an expense dated last month, ahead of nothing newer', async () => {
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

    expect(await screen.findByText('Old rent')).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no hay gastos'),
    ).not.toBeInTheDocument()
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

    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })

  it('shows a delete action on every expense row for any member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })
    const categories = await listCategories({
      db: ownerDb,
      householdId: household.id,
    })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db: ownerDb,
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
      <RecentExpensesList
        db={store.asUser('user-2')}
        householdId={household.id}
      />,
    )

    const row = await screen.findByRole('listitem')
    expect(
      within(row).getByRole('button', { name: 'Eliminar Pizza' }),
    ).toBeInTheDocument()
  })

  it('opens a confirmation dialog when delete is clicked and leaves the expense when canceled', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Pizza' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName('¿Eliminar el gasto?')
    expect(within(dialog).getByText('Pizza')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('listitem')).toHaveTextContent('Pizza')
  })

  it('deletes the expense and refetches the list and remaining budget when confirmed', async () => {
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
      price: 30,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <>
        <RemainingBudgetDisplay db={db} householdId={household.id} />
        <RecentExpensesList db={db} householdId={household.id} />
      </>,
      { queryClient },
    )

    expect(
      await screen.findByRole('status', { name: 'Presupuesto restante $70' }),
    ).toHaveTextContent('$70')
    expect(screen.getByRole('listitem')).toHaveTextContent('Pizza')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar gasto',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('Todavía no hay gastos'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Presupuesto restante $100' }),
    ).toHaveTextContent('$100')
  })

  it('shows a stale-error message and refetches when the expense was already deleted elsewhere', async () => {
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
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    const expense = await createExpense({
      db: ownerDb,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <RecentExpensesList db={ownerDb} householdId={household.id} />,
      {
        queryClient,
      },
    )

    expect(await screen.findByRole('listitem')).toHaveTextContent('Pizza')

    // Deleted directly through the db, bypassing the query cache -- the
    // list still shows the now-stale "Pizza" row until its own delete
    // mutation below discovers the mismatch.
    await deleteExpense({
      db: ownerDb,
      householdId: household.id,
      expenseId: expense.id,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar gasto',
      }),
    )

    expect(
      await screen.findByRole('alert', {
        name: 'Este gasto ya no existe',
      }),
    ).toHaveTextContent('Este gasto ya no existe')
    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('Todavía no hay gastos'),
    ).toBeInTheDocument()
  })

  it('removes only the deleted expense when other rows remain', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    const transporte = categories.find(
      (category) => category.name === 'Transporte',
    )
    expect(comida).toBeDefined()
    expect(transporte).toBeDefined()
    if (comida === undefined || transporte === undefined) {
      throw new Error('expected seeded categories')
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
    await createExpense({
      db,
      householdId: household.id,
      categoryId: transporte.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Taxi',
      price: 8.25,
      comments: '',
      expenseDate: currentMonthDate(20),
    })

    renderWithProviders(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    expect(await screen.findAllByRole('listitem')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar gasto',
      }),
    )

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    })
    expect(screen.getByRole('listitem')).toHaveTextContent('Taxi')
    expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
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

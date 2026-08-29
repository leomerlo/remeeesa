import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, deleteExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership, leaveHousehold } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ExpenseList } from './ExpenseList'
import { expensesInMonthQueryKey } from './queryKeys'
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
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

describe('ExpenseList', () => {
  it('shows an empty state when the household has no expenses this month', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

    expect(
      await screen.findByText('No expenses this month'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it("lists this month's expenses with name, price, category, date, and author", async () => {
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

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

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
    expect(screen.queryByText('No expenses this month')).not.toBeInTheDocument()
  })

  it('does not list an expense dated last month', async () => {
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

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(screen.queryByText('Old rent')).not.toBeInTheDocument()
  })

  it('shows the empty state when the only expenses are from last month', async () => {
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

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

    expect(
      await screen.findByText('No expenses this month'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Old rent')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
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
      <ExpenseList db={remainingDb} householdId={household.id} />,
    )

    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })

  it('shows a delete action on every current-month expense row for any member', async () => {
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
      <ExpenseList db={store.asUser('user-2')} householdId={household.id} />,
    )

    const row = await screen.findByRole('listitem')
    expect(
      within(row).getByRole('button', { name: 'Delete Pizza' }),
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

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Pizza' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveAccessibleName('Delete expense?')
    expect(within(dialog).getByText('Pizza')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

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
        <ExpenseList db={db} householdId={household.id} />
      </>,
      { queryClient },
    )

    expect(
      await screen.findByRole('status', { name: 'Remaining budget $70' }),
    ).toHaveTextContent('$70')
    expect(screen.getByRole('listitem')).toHaveTextContent('Pizza')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete expense',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('No expenses this month'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Remaining budget $100' }),
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
      <ExpenseList db={ownerDb} householdId={household.id} />,
      {
        queryClient,
      },
    )

    expect(await screen.findByRole('listitem')).toHaveTextContent('Pizza')

    await deleteExpense({
      db: ownerDb,
      householdId: household.id,
      expenseId: expense.id,
    })
    await queryClient.invalidateQueries({
      queryKey: expensesInMonthQueryKey({ householdId: household.id }),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete expense',
      }),
    )

    expect(
      await screen.findByRole('alert', {
        name: 'This expense no longer exists',
      }),
    ).toHaveTextContent('This expense no longer exists')
    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('No expenses this month'),
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

    renderWithProviders(<ExpenseList db={db} householdId={household.id} />)

    expect(await screen.findAllByRole('listitem')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pizza' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Delete expense',
      }),
    )

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    })
    expect(screen.getByRole('listitem')).toHaveTextContent('Taxi')
    expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
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
      <ExpenseList db={store.asUser('user-2')} householdId={household.id} />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only household members can access this household',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ExpenseList } from './ExpenseList'

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

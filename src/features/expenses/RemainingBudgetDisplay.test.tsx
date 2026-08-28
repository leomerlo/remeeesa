import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  expensesInMonthQueryKey,
  RemainingBudgetDisplay,
} from './RemainingBudgetDisplay'

async function seedHousehold(monthlyBudget: number) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected Comida category')
  }
  return { db, household, comida }
}

describe('RemainingBudgetDisplay', () => {
  it('shows the monthly budget when there are no expenses this month', async () => {
    const { db, household } = await seedHousehold(100)

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Remaining budget $100' }),
    ).toHaveTextContent('$100')
    expect(screen.getByText('Remaining budget')).toBeInTheDocument()
  })

  it('shows remaining after current-month expenses', async () => {
    const { db, household, comida } = await seedHousehold(100)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 30,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Remaining budget $70' }),
    ).toHaveTextContent('$70')
  })

  it('ignores expenses from other months', async () => {
    const { db, household, comida } = await seedHousehold(100)
    const now = new Date()
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Old pizza',
      price: 40,
      comments: '',
      expenseDate: new Date(now.getFullYear(), now.getMonth() - 1, 15),
    })
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'First-day coffee',
      price: 25,
      comments: '',
      expenseDate: new Date(now.getFullYear(), now.getMonth(), 1),
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Remaining budget $75' }),
    ).toHaveTextContent('$75')
  })

  it('updates to a negative remaining after an over-budget expense is created', async () => {
    const { db, household, comida } = await seedHousehold(100)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
      { queryClient },
    )

    expect(
      await screen.findByRole('status', { name: 'Remaining budget $100' }),
    ).toHaveTextContent('$100')
    expect(screen.getByText('Remaining budget')).toBeInTheDocument()

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Rent',
      price: 150,
      comments: '',
      expenseDate: new Date(),
    })
    await queryClient.invalidateQueries({
      queryKey: expensesInMonthQueryKey({ householdId: household.id }),
    })

    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'Remaining budget -$50' }),
      ).toHaveTextContent('-$50')
    })
  })
})

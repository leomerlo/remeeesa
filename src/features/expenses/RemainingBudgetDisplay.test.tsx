import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createPendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { expensesInMonthQueryKey } from './queryKeys'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

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
  it('shows a loading status before household and expenses resolve', async () => {
    const { db, household } = await seedHousehold(100)

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $100,00',
      }),
    ).toHaveTextContent('$100,00')
  })

  it('shows the monthly budget when there are no expenses this month', async () => {
    const { db, household } = await seedHousehold(100)

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $100,00',
      }),
    ).toHaveTextContent('$100,00')
    expect(screen.getByText('Presupuesto restante')).toBeInTheDocument()
  })

  // Same reasoning as SpentThisMonthDisplay's label: without it, nothing on
  // the card says which month "restante" is even counting down.
  // MonthNavigator (the only real caller) passes an explicit range for
  // whichever month it's paging through; this is the mechanism that makes
  // paging actually change the figure.
  it('computes remaining against the given month instead of the current one when monthStart/monthEnd are passed', async () => {
    const { db, household, comida } = await seedHousehold(100)
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1, 15)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Last month pizza',
      price: 40,
      comments: '',
      expenseDate: lastMonth,
    })
    const monthStart = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth(),
      1,
    )
    const monthEnd = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    )

    renderWithProviders(
      <RemainingBudgetDisplay
        db={db}
        householdId={household.id}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $60,00',
      }),
    ).toHaveTextContent('$60,00')
  })

  it('shows a progress bar at 0% used and the piggy-bank illustration when there are no expenses', async () => {
    const { db, household } = await seedHousehold(100)

    const { container } = renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    await screen.findByRole('status', { name: 'Presupuesto restante $100,00' })
    const progressbar = screen.getByRole('progressbar', {
      name: '% usado',
    })
    expect(progressbar).toHaveAttribute('aria-valuenow', '0')
    expect(progressbar).toHaveAttribute('aria-valuemin', '0')
    expect(progressbar).toHaveAttribute('aria-valuemax', '100')
    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeNull()
  })

  it('updates the progress bar to reflect the percent of budget used', async () => {
    const { db, household, comida } = await seedHousehold(100)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 40,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    await screen.findByRole('status', { name: 'Presupuesto restante $60,00' })
    expect(
      screen.getByRole('progressbar', { name: '% usado' }),
    ).toHaveAttribute('aria-valuenow', '40')
  })

  it('caps the progress bar at 100% when expenses exceed the budget', async () => {
    const { db, household, comida } = await seedHousehold(100)
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

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    await screen.findByRole('status', { name: 'Presupuesto restante -$50,00' })
    expect(
      screen.getByRole('progressbar', { name: '% usado' }),
    ).toHaveAttribute('aria-valuenow', '100')
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
      await screen.findByRole('status', {
        name: 'Presupuesto restante $70,00',
      }),
    ).toHaveTextContent('$70,00')
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
      await screen.findByRole('status', {
        name: 'Presupuesto restante $75,00',
      }),
    ).toHaveTextContent('$75,00')
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
      await screen.findByRole('status', {
        name: 'Presupuesto restante $100,00',
      }),
    ).toHaveTextContent('$100,00')
    expect(screen.getByText('Presupuesto restante')).toBeInTheDocument()

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
        screen.getByRole('status', { name: 'Presupuesto restante -$50,00' }),
      ).toHaveTextContent('-$50,00')
    })
  })

  // Per direct feedback: a bill that's due but unpaid still has to count
  // against what's "left", not just once it's actually paid.
  it("discounts every currently-pending Pendiente's expected amount, with a breakdown line", async () => {
    const { db, household, comida } = await seedHousehold(1000)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Super',
      price: 100,
      comments: '',
      expenseDate: new Date(),
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 300,
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $600,00',
      }),
    ).toHaveTextContent('$600,00')
    expect(
      screen.getByText('Incluye $300,00 pendiente de pago'),
    ).toBeInTheDocument()
  })

  it('folds pending Pendientes into the % usado bar too', async () => {
    const { db, household, comida } = await seedHousehold(1000)
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 300,
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('progressbar', { name: '% usado' }),
    ).toHaveAttribute('aria-valuenow', '30')
  })

  // A Pendiente due in a different month than the one being viewed doesn't
  // belong to that month's total -- a bill due today shouldn't already
  // reduce last month's (closed) figure just because it's still unpaid.
  it('does not discount a pending Pendiente due in a different month than the one being viewed', async () => {
    const { db, household, comida } = await seedHousehold(1000)
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1, 15)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Last month pizza',
      price: 100,
      comments: '',
      expenseDate: lastMonth,
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 300,
    })
    const monthStart = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth(),
      1,
    )
    const monthEnd = new Date(
      lastMonth.getFullYear(),
      lastMonth.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    )

    renderWithProviders(
      <RemainingBudgetDisplay
        db={db}
        householdId={household.id}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $900,00',
      }),
    ).toHaveTextContent('$900,00')
    expect(screen.queryByText(/pendiente de pago/)).not.toBeInTheDocument()
  })

  // Regression: Cuentas por pagar shows every pending Pendiente regardless
  // of due date, so a bill due next month is still "pending" today -- but
  // it shouldn't already discount *this* month's remaining budget. Per
  // direct feedback, after seeing a real month's worth of bills due in a
  // later month push this figure unexpectedly negative.
  it("does not discount a pending Pendiente due next month from the current month's remaining budget", async () => {
    const { db, household, comida } = await seedHousehold(1000)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Super',
      price: 100,
      comments: '',
      expenseDate: new Date(),
    })
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15)
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Cuota Visa',
      dueDate: nextMonth,
      expectedAmount: 917,
    })

    renderWithProviders(
      <RemainingBudgetDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $900,00',
      }),
    ).toHaveTextContent('$900,00')
    expect(screen.queryByText(/pendiente de pago/)).not.toBeInTheDocument()
  })
})

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { SpentThisMonthDisplay } from './SpentThisMonthDisplay'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected Comida category')
  }
  return { db, household, comida }
}

describe('SpentThisMonthDisplay', () => {
  it('shows a loading status before expenses resolve', async () => {
    const { db, household } = await seedHousehold()

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  // Zero, not the monthly budget, and not blank -- this card counts up from
  // nothing, the mirror image of RemainingBudgetDisplay counting down.
  it('shows $0,00 with no expenses this month', async () => {
    const { db, household } = await seedHousehold()

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $0,00' }),
    ).toHaveTextContent('$0,00')
    expect(screen.getByText('Gastado este mes')).toBeInTheDocument()
  })

  it('sums current-month expenses, ascending', async () => {
    const { db, household, comida } = await seedHousehold()
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
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Coffee',
      price: 5,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $45,00' }),
    ).toHaveTextContent('$45,00')
  })

  it('ignores expenses from other months', async () => {
    const { db, household, comida } = await seedHousehold()
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

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $0,00' }),
    ).toHaveTextContent('$0,00')
  })

  // The card exists to say which period the figure covers -- without it,
  // "Gastado este mes" alongside "Presupuesto restante" gives no way to tell
  // whether the two numbers are even talking about the same month.
  // MonthNavigator (the only real caller) passes an explicit range for
  // whichever month it's paging through; this is the mechanism that makes
  // paging actually change the figure.
  it('sums the given month instead of the current one when monthStart/monthEnd are passed', async () => {
    const { db, household, comida } = await seedHousehold()
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1, 15)
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Last month pizza',
      price: 60,
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
      <SpentThisMonthDisplay
        db={db}
        householdId={household.id}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $60,00' }),
    ).toHaveTextContent('$60,00')
  })
})

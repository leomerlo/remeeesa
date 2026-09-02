import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { formatMonthLabel } from '@/lib/format'
import { MonthNavigator } from './MonthNavigator'

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

describe('MonthNavigator', () => {
  it('shows the current month by default, on both cards at once', async () => {
    const { db, household } = await seedHousehold()

    renderWithProviders(<MonthNavigator db={db} householdId={household.id} />)

    expect(
      await screen.findByText(formatMonthLabel(new Date())),
    ).toBeInTheDocument()
    expect(await screen.findByText('Gastado este mes')).toBeInTheDocument()
    expect(await screen.findByText('Presupuesto restante')).toBeInTheDocument()
  })

  // The one guard that keeps this from paging somewhere meaningless: a
  // future month has no Expenses and nothing to show yet.
  it('disables "Mes siguiente" while viewing the current month', async () => {
    const { db, household } = await seedHousehold()

    renderWithProviders(<MonthNavigator db={db} householdId={household.id} />)

    await screen.findByText('Gastado este mes')
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Mes anterior' }),
    ).not.toBeDisabled()
  })

  it('pages both cards to the previous month together, and re-enables Mes siguiente', async () => {
    const { db, household, comida } = await seedHousehold()
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
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
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'This month pizza',
      price: 999,
      comments: '',
      expenseDate: now,
    })

    renderWithProviders(<MonthNavigator db={db} householdId={household.id} />)
    await screen.findByRole('status', { name: 'Gastado este mes $999,00' })

    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))

    expect(
      await screen.findByText(formatMonthLabel(lastMonth)),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $40,00' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mes siguiente' }),
    ).not.toBeDisabled()
  })
})

import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createPendiente } from '@/lib/pendientes'
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

  // Per direct feedback: a bill that's due but unpaid still has to count
  // against the budget, not just once it's actually paid.
  it("adds every currently-pending Pendiente's expected amount, with a paid/pendiente breakdown", async () => {
    const { db, household, comida } = await seedHousehold()
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
      expectedAmount: 5000,
    })

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $5.100,00' }),
    ).toHaveTextContent('$5.100,00')
    // The two halves are separate elements so the line can break between
    // them, so they are asserted separately rather than as one string.
    expect(screen.getByText(/pagado/)).toHaveTextContent('$100,00 pagado')
    expect(screen.getByText(/pendiente/)).toHaveTextContent(
      '$5.000,00 pendiente',
    )
  })

  it('omits a Pendiente with no expected amount yet from the pending total', async () => {
    const { db, household, comida } = await seedHousehold()
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Compras variables',
      dueDate: new Date(),
      expectedAmount: null,
    })

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $0,00' }),
    ).toHaveTextContent('$0,00')
    expect(screen.queryByText(/pendiente$/)).not.toBeInTheDocument()
  })

  // A Pendiente due in a different month than the one being viewed doesn't
  // belong to that month's total -- a bill due today shouldn't already
  // reduce last month's (closed) figure just because it's still unpaid.
  it('does not add a pending Pendiente due in a different month than the one being viewed', async () => {
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
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: new Date(),
      expectedAmount: 5000,
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
    expect(screen.queryByText(/pendiente$/)).not.toBeInTheDocument()
  })

  // Regression: Cuentas por pagar shows every pending Pendiente regardless
  // of due date, so a bill due next month is still "pending" today -- but
  // it shouldn't already eat into *this* month's total. Per direct
  // feedback, after seeing a real month's worth of bills due in a later
  // month inflate this figure unexpectedly.
  it("does not add a pending Pendiente due next month to the current month's total", async () => {
    const { db, household, comida } = await seedHousehold()
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
      expectedAmount: 917000,
    })

    renderWithProviders(
      <SpentThisMonthDisplay db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('status', { name: 'Gastado este mes $100,00' }),
    ).toHaveTextContent('$100,00')
    expect(screen.queryByText(/pendiente$/)).not.toBeInTheDocument()
  })
})

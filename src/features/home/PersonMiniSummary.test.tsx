import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PersonMiniSummary } from './PersonMiniSummary'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected Comida category')
  }
  return { db, household, comida }
}

describe('PersonMiniSummary', () => {
  it('shows a loading status before data resolves', async () => {
    const { db, household, comida } = await seedHousehold()
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <PersonMiniSummary db={db} householdId={household.id} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    await screen.findByRole('list', { name: 'Gastos por persona' })
  })

  // Same reasoning as CategoryMiniSummary's: nothing at all, not another
  // card repeating a message the movements list's own empty state already
  // shows on Home.
  it('renders nothing when there are no expenses this month', async () => {
    const { db, household } = await seedHousehold()

    const { container } = renderWithProviders(
      <PersonMiniSummary db={db} householdId={household.id} />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('lists people sorted by total descending', async () => {
    const { db, household, comida } = await seedHousehold()
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: '',
      expenseDate: new Date(),
    })
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Bob',
      name: 'Sushi',
      price: 25,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <PersonMiniSummary db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Integrantes' }),
    ).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Gastos por persona' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Bob')
    expect(items[0]).toHaveTextContent('$25,00')
    expect(items[1]).toHaveTextContent('Ada')
    expect(items[1]).toHaveTextContent('$10,00')
  })

  // PersonMiniSummary has no isError branch (unlike RecentExpensesList) --
  // on a query error it stays on the loading view rather than surfacing a
  // message. This documents that actual behavior; see the QA report for the
  // inconsistency this reflects.
  it('stays on the loading view rather than erroring when the query fails', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <PersonMiniSummary
        db={store.asUser('user-2')}
        householdId={household.id}
      />,
      { queryClient },
    )

    await waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .findAll()
          .some((query) => query.state.status === 'error'),
      ).toBe(true)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

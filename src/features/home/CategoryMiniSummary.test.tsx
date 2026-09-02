import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createExpense,
  findOrCreateCategory,
  listCategories,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoryMiniSummary } from './CategoryMiniSummary'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  return { db, household, categories }
}

describe('CategoryMiniSummary', () => {
  it('shows a loading status before data resolves', async () => {
    const { db, household, categories } = await seedHousehold()
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
      price: 10,
      comments: '',
      expenseDate: new Date(),
    })

    renderWithProviders(
      <CategoryMiniSummary db={db} householdId={household.id} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    await screen.findByRole('list', { name: 'Gastos por categoría' })
  })

  // Renders nothing at all -- not a card repeating "Todavía no hay gastos
  // este mes" -- because that message is already the movements list's own
  // empty state, right above this one on Home.
  it('renders nothing when there are no expenses this month', async () => {
    const { db, household } = await seedHousehold()

    const { container } = renderWithProviders(
      <CategoryMiniSummary db={db} householdId={household.id} />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('lists categories sorted by total descending, with a color swatch and amount each', async () => {
    const { db, household, categories } = await seedHousehold()
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
      categoryId: transporte.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Taxi',
      price: 8,
      comments: '',
      expenseDate: new Date(),
    })
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
      <CategoryMiniSummary db={db} householdId={household.id} />,
    )

    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Comida')
    expect(items[0]).toHaveTextContent('$40,00')
    expect(items[1]).toHaveTextContent('Transporte')
    expect(items[1]).toHaveTextContent('$8,00')
    const swatch = items[0]?.querySelector('[data-testid="category-swatch"]')
    expect(swatch).toHaveStyle({ backgroundColor: comida.color })
  })

  it('shows only the top 5 categories', async () => {
    const { db, household } = await seedHousehold()
    const extra = await findOrCreateCategory({
      db,
      householdId: household.id,
      name: 'Regalos',
    })
    const categories = await listCategories({ db, householdId: household.id })
    const allCategories = [...categories, extra]
    expect(allCategories.length).toBeGreaterThanOrEqual(6)

    for (const [index, category] of allCategories.entries()) {
      await createExpense({
        db,
        householdId: household.id,
        categoryId: category.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: `Expense ${String(index)}`,
        price: 10 + index,
        comments: '',
        expenseDate: new Date(),
      })
    }

    renderWithProviders(
      <CategoryMiniSummary db={db} householdId={household.id} />,
    )

    const list = await screen.findByRole('list', {
      name: 'Gastos por categoría',
    })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
  })

  // CategoryMiniSummary has no isError branch (unlike RecentExpensesList) --
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
      <CategoryMiniSummary
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

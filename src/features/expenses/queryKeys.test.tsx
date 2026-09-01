import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseForm } from './AddExpenseForm'
import {
  categoriesQueryKey,
  expensesInMonthQueryKey,
  expensesQueryKey,
  recentExpensesQueryKey,
} from './queryKeys'
import { RecentExpensesList } from './RecentExpensesList'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

describe('expense query keys', () => {
  it('scopes categories to the household', () => {
    expect(categoriesQueryKey({ householdId: 'hh-1' })).toEqual([
      'categories',
      'hh-1',
    ])
  })

  it('builds a household-scoped expenses prefix', () => {
    expect(expensesQueryKey({ householdId: 'hh-1' })).toEqual([
      'expenses',
      'hh-1',
    ])
  })

  it('nests the month-scoped key under the expenses prefix', () => {
    expect(expensesInMonthQueryKey({ householdId: 'hh-1' })).toEqual([
      'expenses',
      'hh-1',
      'month',
    ])
  })

  it('nests the recent-expenses key under the expenses prefix', () => {
    expect(
      recentExpensesQueryKey({ householdId: 'hh-1', limit: 10 }),
    ).toEqual(['expenses', 'hh-1', 'recent', 10])
  })
})

describe('expenses prefix invalidation', () => {
  // Proves the mechanism the query-key refactor exists for: RemainingBudgetDisplay
  // reads the month-scoped key and RecentExpensesList reads the recent key,
  // both nested under the same expensesQueryKey({ householdId }) prefix. A
  // mutation from a third, unrelated consumer (AddExpenseForm) that
  // invalidates only that prefix must refetch both of the others -- not
  // just its own leaf key.
  it('refetches every other consumer of the expenses prefix after an add-expense mutation', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <>
        <RemainingBudgetDisplay db={db} householdId={household.id} />
        <RecentExpensesList db={db} householdId={household.id} />
        <AddExpenseForm
          db={db}
          householdId={household.id}
          memberId="user-1"
          authorDisplayName="Ada"
        />
      </>,
      { queryClient },
    )

    expect(
      await screen.findByRole('status', { name: 'Presupuesto restante $100' }),
    ).toHaveTextContent('$100')
    expect(await screen.findByText('Todavía no hay gastos')).toBeInTheDocument()

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    // Both other consumers -- not just the one that mutated -- reflect the
    // new expense once the shared prefix invalidates.
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: 'Presupuesto restante $90' }),
      ).toHaveTextContent('$90')
    })
    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(
      screen.queryByText('Todavía no hay gastos'),
    ).not.toBeInTheDocument()
  })

  // RecentExpensesList's delete mutation invalidates only expensesQueryKey,
  // a sibling prefix to categoriesQueryKey -- not an ancestor of it -- so it
  // must not touch the categories cache another consumer (AddExpenseForm)
  // depends on. This is the actual behavior read from the implementation,
  // not an assumption: contrast with AddExpenseForm's own mutation, which
  // deliberately invalidates categoriesQueryKey too because it can create a
  // category via findOrCreateCategory.
  it('does not invalidate the categories cache when an expense is deleted', async () => {
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
      price: 10,
      comments: '',
      expenseDate: new Date(),
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <>
        <AddExpenseForm
          db={db}
          householdId={household.id}
          memberId="user-1"
          authorDisplayName="Ada"
        />
        <RecentExpensesList db={db} householdId={household.id} />
      </>,
      { queryClient },
    )

    await screen.findByRole('listitem')
    await waitFor(() => {
      expect(
        queryClient.getQueryState(categoriesQueryKey({ householdId: household.id }))
          ?.dataUpdatedAt,
      ).toBeGreaterThan(0)
    })
    const categoriesUpdatedAtBefore = queryClient.getQueryState(
      categoriesQueryKey({ householdId: household.id }),
    )?.dataUpdatedAt

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
      queryClient.getQueryState(categoriesQueryKey({ householdId: household.id }))
        ?.dataUpdatedAt,
    ).toBe(categoriesUpdatedAtBefore)
  })
})

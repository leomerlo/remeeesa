import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseForm } from './AddExpenseForm'
import type { EditExpenseTarget } from './AddExpenseForm'
import {
  categoriesQueryKey,
  expensesInMonthQueryKey,
  expensesQueryKey,
  recentExpensesQueryKey,
} from './queryKeys'
import { RecentExpensesList } from './RecentExpensesList'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

// Wires RecentExpensesList's tap-to-edit row into AddExpenseForm's edit
// mode, the same pairing HomePage does -- delete now lives inside the edit
// form (see AddExpenseForm.tsx), not on the row itself.
function RecentExpensesListWithEdit(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
}): ReactElement {
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(null)

  return (
    <>
      <AddExpenseForm
        db={props.db}
        householdId={props.householdId}
        memberId={props.memberId}
        authorDisplayName={props.authorDisplayName}
        editExpense={editExpense}
        onEditFinished={() => {
          setEditExpense(null)
        }}
      />
      <RecentExpensesList
        db={props.db}
        householdId={props.householdId}
        onEditExpense={(expense, categoryName) => {
          setEditExpense({
            expenseId: expense.id,
            name: expense.name,
            price: expense.price,
            categoryName,
            comments: expense.comments,
            expenseDate: expense.expenseDate,
            memberId: expense.memberId,
            pendienteId: expense.pendienteId,
            isService: expense.isService,
          })
        }}
      />
    </>
  )
}

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
    expect(recentExpensesQueryKey({ householdId: 'hh-1', limit: 10 })).toEqual([
      'expenses',
      'hh-1',
      'recent',
      10,
    ])
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
      await screen.findByRole('status', {
        name: 'Presupuesto restante $100',
      }),
    ).toHaveTextContent('$100')
    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()

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
      screen.queryByText('Todavía no hay gastos este mes'),
    ).not.toBeInTheDocument()
  })

  // AddExpenseForm's delete mutation (reached by tapping a row open, then
  // "Eliminar gasto") invalidates only expensesQueryKey, a sibling prefix to
  // categoriesQueryKey -- not an ancestor of it -- so it must not touch the
  // categories cache. This is the actual behavior read from the
  // implementation, not an assumption: contrast with the same form's
  // add/edit mutation, which deliberately invalidates categoriesQueryKey too
  // because it can create a category via findOrCreateCategory, something a
  // delete can never do.
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
      <RecentExpensesListWithEdit
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
      { queryClient },
    )

    await screen.findByRole('listitem')
    await waitFor(() => {
      expect(
        queryClient.getQueryState(
          categoriesQueryKey({ householdId: household.id }),
        )?.dataUpdatedAt,
      ).toBeGreaterThan(0)
    })
    const categoriesUpdatedAtBefore = queryClient.getQueryState(
      categoriesQueryKey({ householdId: household.id }),
    )?.dataUpdatedAt

    fireEvent.click(screen.getByRole('button', { name: 'Editar Pizza' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar gasto' }),
    )
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar gasto',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    })
    expect(
      queryClient.getQueryState(
        categoriesQueryKey({ householdId: household.id }),
      )?.dataUpdatedAt,
    ).toBe(categoriesUpdatedAtBefore)
  })
})

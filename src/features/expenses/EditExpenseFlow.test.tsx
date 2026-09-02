import { useState } from 'react'
import type { ReactElement } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  createExpense,
  deleteExpense,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseForm } from './AddExpenseForm'
import type { EditExpenseTarget } from './AddExpenseForm'
import { RecentExpensesList } from './RecentExpensesList'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function currentMonthRange(now = new Date()): {
  readonly monthStart: Date
  readonly monthEnd: Date
} {
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    monthEnd: new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  }
}

function currentMonthDate(day: number): Date {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(day, now.getDate()),
  )
}

function EditExpenseHarness(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
}): ReactElement {
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(null)

  return (
    <>
      <RemainingBudgetDisplay db={props.db} householdId={props.householdId} />
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
          })
        }}
      />
    </>
  )
}

async function seedCurrentMonthExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId?: string
  readonly authorDisplayName?: string
  readonly name?: string
  readonly price?: number
}): Promise<Expense> {
  const categories = await listCategories({
    db: input.db,
    householdId: input.householdId,
  })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected Comida category')
  }
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: comida.id,
    memberId: input.memberId ?? 'user-1',
    authorDisplayName: input.authorDisplayName ?? 'Ada',
    name: input.name ?? 'Pizza',
    price: input.price ?? 10,
    comments: 'Friday dinner',
    expenseDate: currentMonthDate(15),
  })
}

describe('EditExpenseFlow', () => {
  it('opens a pre-filled form when a list row is tapped', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Pizza',
      price: 12.5,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('Pizza')
    expect(screen.getByLabelText('Precio')).toHaveValue('12.5')
    expect(screen.getByLabelText('Categoría')).toHaveValue('Comida')
    expect(screen.getByLabelText('Comentario')).toHaveValue('Friday dinner')
    expect(screen.getByLabelText('Fecha')).toHaveValue(
      localDateInputValue(currentMonthDate(15)),
    )
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })

  it('updates the expense and refetches the list and remaining budget without reload', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Pizza',
      price: 10,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(await screen.findByText('$90,00')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Pasta' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.getByText('Pasta')).toBeInTheDocument()
      expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
      expect(screen.getByText('$75,00')).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()

    const listed = await listExpensesInMonth({
      db,
      householdId: household.id,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([
      expect.objectContaining({
        name: 'Pasta',
        price: 25,
      }),
    ])
  })

  it('accepts a date edit that moves the expense to a past month', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Pizza',
      price: 10,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    // Built directly (not via setMonth on a mutated "today") because
    // setMonth(-1) on a date still holding today's day-of-month rolls
    // forward whenever the previous month has fewer days than today's date
    // (e.g. running this on the 31st with a 30-day or February previous
    // month), landing back in the current month instead of last month.
    const today = new Date()
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: localDateInputValue(lastMonth) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // The edit is accepted now that Histórico surfaces every month: the form
    // closes instead of surfacing an out-of-month error.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Guardar cambios' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    const listed = await listExpensesInMonth({
      db,
      householdId: household.id,
      ...currentMonthRange(),
    })
    // It left the current month, so the month-scoped read no longer sees it.
    expect(listed).toEqual([])
  })

  it('shows a stale-expense message and refetches the list when the row was deleted elsewhere', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    const expense = await seedCurrentMonthExpense({
      db: ownerDb,
      householdId: household.id,
      name: 'Pizza',
      price: 10,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={ownerDb}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    await deleteExpense({
      db: store.asUser('user-2'),
      householdId: household.id,
      expenseId: expense.id,
    })
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Stale edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este gasto ya no existe',
    )
    await waitFor(() => {
      expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
      expect(
        screen.getByText('Todavía no hay gastos este mes'),
      ).toBeInTheDocument()
    })
  })

  it('lets a non-author household member edit an expense', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.seedMembership({ userId: 'user-2', householdId: household.id })
    await seedCurrentMonthExpense({
      db: ownerDb,
      householdId: household.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
    })

    const editorDb = store.asUser('user-2')
    renderWithProviders(
      <EditExpenseHarness
        db={editorDb}
        householdId={household.id}
        memberId="user-2"
        authorDisplayName="Bob"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Shared edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.getByText('Shared edit')).toBeInTheDocument()
    })

    const listed = await listExpensesInMonth({
      db: editorDb,
      householdId: household.id,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([
      expect.objectContaining({
        name: 'Shared edit',
        memberId: 'user-1',
        authorDisplayName: 'Ada',
      }),
    ])
  })

  // Deleting now lives inside the edit form (the row itself has no
  // buttons, matching the approved comp) -- opening a row, confirming
  // delete, removes the expense and refetches the list and budget.
  it('deletes the expense from within the edit form and refetches the list and budget', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Pizza',
      price: 30,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(
      await screen.findByRole('status', {
        name: 'Presupuesto restante $70,00',
      }),
    ).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar gasto' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('¿Eliminar el gasto?')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar gasto' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Presupuesto restante $100,00' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()
  })

  it('cancels the delete confirmation and keeps the expense', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Pizza',
      price: 10,
    })

    renderWithProviders(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar gasto' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pizza')).toBeInTheDocument()
  })
})

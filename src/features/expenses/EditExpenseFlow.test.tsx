import { useState } from 'react'
import type { ReactElement } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
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
import { ExpenseList } from './ExpenseList'
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
      <ExpenseList
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
  it('opens a pre-filled form when edit is clicked on a list row', async () => {
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

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pizza' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Pizza')
    expect(screen.getByLabelText('Price')).toHaveValue('12.5')
    expect(screen.getByLabelText('Category')).toHaveValue('Comida')
    expect(screen.getByLabelText('Comments')).toHaveValue('Friday dinner')
    expect(screen.getByLabelText('Date')).toHaveValue(
      localDateInputValue(currentMonthDate(15)),
    )
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
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

    expect(await screen.findByText('$90')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pizza' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Pasta' },
    })
    fireEvent.change(screen.getByLabelText('Price'), {
      target: { value: '25' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(screen.getByText('Pasta')).toBeInTheDocument()
      expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
      expect(screen.getByText('$75')).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: 'Save changes' }),
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

  it('shows the out-of-month validation message and keeps the form open', async () => {
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

    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    lastMonth.setDate(15)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pizza' }))
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: localDateInputValue(lastMonth) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Expense date must be in the current calendar month',
    )
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Pizza')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pizza' }))
    await deleteExpense({
      db: store.asUser('user-2'),
      householdId: household.id,
      expenseId: expense.id,
    })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Stale edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This expense no longer exists',
    )
    await waitFor(() => {
      expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
      expect(screen.getByText('No expenses this month')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Pizza' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Shared edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

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
})

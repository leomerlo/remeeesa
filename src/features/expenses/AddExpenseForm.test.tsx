import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseForm } from './AddExpenseForm'
import { expensesInMonthQueryKey } from './queryKeys'

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

async function renderForm() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  renderWithProviders(
    <AddExpenseForm
      db={db}
      householdId={household.id}
      memberId="user-1"
      authorDisplayName="Ada"
    />,
  )
  return { db, householdId: household.id }
}

function fillExpense(fields: {
  readonly name?: string
  readonly price?: string
  readonly category?: string
  readonly comments?: string
  readonly date?: string
}): void {
  if (fields.name !== undefined) {
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: fields.name },
    })
  }
  if (fields.price !== undefined) {
    fireEvent.change(screen.getByLabelText('Price'), {
      target: { value: fields.price },
    })
  }
  if (fields.category !== undefined) {
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: fields.category },
    })
  }
  if (fields.comments !== undefined) {
    fireEvent.change(screen.getByLabelText('Comments'), {
      target: { value: fields.comments },
    })
  }
  if (fields.date !== undefined) {
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: fields.date },
    })
  }
}

function submitExpense(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
}

describe('AddExpenseForm', () => {
  it('stores a valid expense for the logged-in member in the current month', async () => {
    const { db, householdId } = await renderForm()
    const today = new Date()

    fillExpense({
      name: 'Pizza',
      price: '12.5',
      category: 'Comida',
      comments: 'Friday dinner',
    })
    submitExpense()

    await waitFor(async () => {
      const { monthStart, monthEnd } = currentMonthRange(today)
      const listed = await listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      })
      expect(listed).toEqual([
        expect.objectContaining({
          householdId,
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name: 'Pizza',
          price: 12.5,
          comments: 'Friday dinner',
        }),
      ])
    })

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Comments')).toHaveValue('')
    expect(screen.getByLabelText('Date')).toHaveValue(
      localDateInputValue(today),
    )
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument()
  })

  it('rejects an empty name', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: '',
      price: '10',
      category: 'Comida',
    })
    submitExpense()

    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('rejects a whitespace-only name', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: '   ',
      price: '10',
      category: 'Comida',
    })
    submitExpense()

    expect(screen.getByRole('alert')).toHaveTextContent(/name/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('rejects a zero price', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: 'Pizza',
      price: '0',
      category: 'Comida',
    })
    submitExpense()

    expect(screen.getByRole('alert')).toHaveTextContent(/price/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('rejects a negative or non-numeric price', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: 'Pizza',
      price: '-1',
      category: 'Comida',
    })
    submitExpense()
    expect(screen.getByRole('alert')).toHaveTextContent(/price/i)

    fillExpense({
      name: 'Pizza',
      price: 'abc',
      category: 'Comida',
    })
    submitExpense()
    expect(screen.getByRole('alert')).toHaveTextContent(/price/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('rejects a future date', async () => {
    const { db, householdId } = await renderForm()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    fillExpense({
      name: 'Pizza',
      price: '10',
      category: 'Comida',
      date: localDateInputValue(tomorrow),
    })
    submitExpense()

    expect(screen.getByRole('alert')).toHaveTextContent(/future/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('reuses the seeded Comida category when the typed name differs only by case and space', async () => {
    const { db, householdId } = await renderForm()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    fillExpense({
      name: 'Pizza',
      price: '10',
      category: '  COMIDA  ',
    })
    submitExpense()

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          categoryId: comida.id,
          name: 'Pizza',
        }),
      ])
    })

    const after = await listCategories({ db, householdId })
    expect(
      after.filter((category) => category.name.toLowerCase() === 'comida'),
    ).toHaveLength(1)
  })

  it('includes a backdated expense in the calendar month of its date', async () => {
    const { db, householdId } = await renderForm()
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    fillExpense({
      name: 'Backdated groceries',
      price: '8.25',
      category: 'Comida',
      date: localDateInputValue(firstOfMonth),
    })
    submitExpense()

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(now),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          name: 'Backdated groceries',
          price: 8.25,
          expenseDate: firstOfMonth,
        }),
      ])
    })
  })

  it('lists a previous-month expense only when that month is queried', async () => {
    const { db, householdId } = await renderForm()
    const now = new Date()
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)

    fillExpense({
      name: 'Last month rent',
      price: '40',
      category: 'Servicios',
      date: localDateInputValue(lastMonth),
    })
    submitExpense()

    await waitFor(async () => {
      const previousMonth = await listExpensesInMonth({
        db,
        householdId,
        monthStart: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1),
        monthEnd: new Date(
          lastMonth.getFullYear(),
          lastMonth.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ),
      })
      expect(previousMonth).toEqual([
        expect.objectContaining({
          name: 'Last month rent',
          price: 40,
          expenseDate: lastMonth,
        }),
      ])
      const currentMonth = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(now),
      })
      expect(currentMonth).toEqual([])
    })
  })

  it('rejects an empty category', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: 'Pizza',
      price: '10',
      category: '   ',
    })
    submitExpense()

    expect(screen.getByRole('alert')).toHaveTextContent(/category/i)
    expect(
      await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  it('defaults the date to today and caps the picker at today', async () => {
    await renderForm()
    const today = localDateInputValue(new Date())

    expect(screen.getByLabelText('Date')).toHaveValue(today)
    expect(screen.getByLabelText('Date')).toHaveAttribute('max', today)
  })

  it('creates a new category from free text and stores comments as empty when omitted', async () => {
    const { db, householdId } = await renderForm()

    fillExpense({
      name: 'Museum tickets',
      price: '20',
      category: 'Cultura',
    })
    submitExpense()

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      })
      expect(listed).toHaveLength(1)
      const created = listed[0]
      expect(created).toMatchObject({
        name: 'Museum tickets',
        price: 20,
        comments: '',
      })
      const categories = await listCategories({ db, householdId })
      expect(categories.some((category) => category.name === 'Cultura')).toBe(
        true,
      )
      expect(created?.categoryId).toBe(
        categories.find((category) => category.name === 'Cultura')?.id,
      )
    })
  })

  it('invalidates the shared month query so another view sees the new expense', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    renderWithProviders(
      <>
        <AddExpenseForm
          db={db}
          householdId={household.id}
          memberId="user-1"
          authorDisplayName="Ada"
        />
        <MonthExpenseCount db={db} householdId={household.id} />
      </>,
    )

    expect(await screen.findByText('Month expenses: 0')).toBeInTheDocument()
    fillExpense({
      name: 'Pizza',
      price: '10',
      category: 'Comida',
    })
    submitExpense()

    await waitFor(() => {
      expect(screen.getByText('Month expenses: 1')).toBeInTheDocument()
    })
  })
})

function MonthExpenseCount(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const expensesQuery = useQuery({
    queryKey: expensesInMonthQueryKey({ householdId: props.householdId }),
    queryFn: () =>
      listExpensesInMonth({
        db: props.db,
        householdId: props.householdId,
        ...currentMonthRange(),
      }),
  })
  if (expensesQuery.data === undefined) {
    return <p>Loading expenses</p>
  }

  return <p>{`Month expenses: ${String(expensesQuery.data.length)}`}</p>
}

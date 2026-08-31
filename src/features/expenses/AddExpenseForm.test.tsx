import { useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  FirestoreDeniedError,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseSheet } from './AddExpenseSheet'
import type { AddExpenseSheetProps } from './AddExpenseSheet'
import { expensesInMonthQueryKey } from './queryKeys'

function AddExpenseSheetHarness(
  props: Omit<AddExpenseSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddExpenseSheet open={open} onOpenChange={setOpen} {...props} />
}

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
    <AddExpenseSheetHarness
      db={db}
      householdId={household.id}
      memberId="user-1"
      authorDisplayName="Ada"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
  await screen.findByLabelText('Name')
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
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
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

    // A successful save closes the sheet: the form unmounts and the
    // trigger button reappears.
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Add expense' }),
      ).toBeInTheDocument()
    })
  })

  it('resets the fields to empty defaults when reopened after a successful save', async () => {
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
      const listed = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(today),
      })
      expect(listed).toHaveLength(1)
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Comments')).toHaveValue('')
    expect(screen.getByLabelText('Date')).toHaveValue(
      localDateInputValue(today),
    )
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument()
  })

  it('discards unsaved input when dismissed with Escape, reopening with empty defaults', async () => {
    await renderForm()
    const today = new Date()

    // Category is deliberately left unset here: typing into it opens its
    // suggestion popover, which is itself a dismissable layer nested inside
    // the sheet -- a bare Escape would close that popover first rather than
    // the sheet, which isn't what this test is exercising.
    fillExpense({
      name: 'Draft pizza',
      price: '9',
      comments: 'Unsaved',
    })
    expect(screen.getByLabelText('Name')).toHaveValue('Draft pizza')

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
    expect(screen.getByLabelText('Comments')).toHaveValue('')
    expect(screen.getByLabelText('Date')).toHaveValue(
      localDateInputValue(today),
    )
  })

  it('discards unsaved input when dismissed via an outside click, reopening with empty defaults', async () => {
    await renderForm()

    fillExpense({
      name: 'Draft pizza',
      price: '9',
      category: 'Comida',
    })
    expect(screen.getByLabelText('Name')).toHaveValue('Draft pizza')

    // Radix's outside-pointer-down listener attaches after a 0ms timeout, to
    // avoid reacting to the same click that opened the dialog.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(overlay).not.toBeNull()
    fireEvent.pointerDown(overlay as Element)
    fireEvent.click(overlay as Element)

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
  })

  it('discards unsaved input when dismissed via the close control, reopening with empty defaults', async () => {
    await renderForm()

    fillExpense({
      name: 'Draft pizza',
      price: '9',
      category: 'Comida',
    })
    expect(screen.getByLabelText('Name')).toHaveValue('Draft pizza')

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Add expense' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(await screen.findByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Price')).toHaveValue('')
    expect(screen.getByLabelText('Category')).toHaveValue('')
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

  it('selects an existing category by clicking its colored option', async () => {
    const { db, householdId } = await renderForm()
    const categories = await listCategories({ db, householdId })
    const servicios = categories.find(
      (category) => category.name === 'Servicios',
    )
    expect(servicios).toBeDefined()
    if (servicios === undefined) {
      throw new Error('expected Servicios category')
    }

    fillExpense({ name: 'Internet', price: '15' })
    const combobox = screen.getByRole('combobox', { name: 'Category' })
    fireEvent.focus(combobox)

    const option = await screen.findByRole('option', { name: 'Servicios' })
    expect(option.querySelector('[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: servicios.color,
    })
    fireEvent.click(option)

    expect(combobox).toHaveValue('Servicios')
    submitExpense()

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          categoryId: servicios.id,
          name: 'Internet',
        }),
      ])
    })
  })

  it('selects an option using only the keyboard, without clicking', async () => {
    const { db, householdId } = await renderForm()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    fillExpense({ name: 'Groceries', price: '5' })
    const combobox = screen.getByRole('combobox', { name: 'Category' })
    fireEvent.focus(combobox)

    const listbox = await screen.findByRole('listbox', { name: 'Categories' })
    expect(combobox).toHaveAttribute('aria-controls', listbox.id)

    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    const active = await screen.findByRole('option', { name: 'Comida' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(combobox).toHaveAttribute('aria-activedescendant', active.id)

    fireEvent.keyDown(combobox, { key: 'Enter' })

    expect(combobox).toHaveValue('Comida')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

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
          name: 'Groceries',
        }),
      ])
    })
  })

  async function renderFormWithCategoriesLoaded(): Promise<{
    readonly combobox: HTMLElement
  }> {
    await renderForm()
    const combobox = screen.getByRole('combobox', { name: 'Category' })
    // React Query resolves `listCategories` asynchronously; open once and
    // close so the categories are cached before a test exercises the
    // closed-state keyboard branches (they'd otherwise navigate an
    // empty list on the first synchronous keydown).
    fireEvent.focus(combobox)
    await screen.findByRole('listbox', { name: 'Categories' })
    fireEvent.keyDown(combobox, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    return { combobox }
  }

  it('opens the list at the last option when ArrowUp is pressed while closed', async () => {
    const { combobox } = await renderFormWithCategoriesLoaded()

    fireEvent.keyDown(combobox, { key: 'ArrowUp' })

    const active = await screen.findByRole('option', { name: 'Otros' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(combobox).toHaveAttribute('aria-activedescendant', active.id)
  })

  it('wraps ArrowDown navigation from the last option back to the first', async () => {
    const { combobox } = await renderFormWithCategoriesLoaded()

    // Jump straight to the last option (Otros), then one more ArrowDown
    // should wrap around to the first (Comida).
    fireEvent.keyDown(combobox, { key: 'ArrowUp' })
    await screen.findByRole('option', { name: 'Otros' })
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })

    const active = await screen.findByRole('option', { name: 'Comida' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(combobox).toHaveAttribute('aria-activedescendant', active.id)
  })

  it('wraps ArrowUp navigation from the first option back to the last', async () => {
    const { combobox } = await renderFormWithCategoriesLoaded()

    // Jump straight to the first option (Comida), then one more ArrowUp
    // should wrap around to the last (Otros).
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    await screen.findByRole('option', { name: 'Comida' })
    fireEvent.keyDown(combobox, { key: 'ArrowUp' })

    const active = await screen.findByRole('option', { name: 'Otros' })
    expect(active).toHaveAttribute('aria-selected', 'true')
    expect(combobox).toHaveAttribute('aria-activedescendant', active.id)
  })

  it('closes the list on Escape without changing the field value', async () => {
    await renderForm()
    const combobox = screen.getByRole('combobox', { name: 'Category' })

    fireEvent.change(combobox, { target: { value: 'serv' } })
    await screen.findByRole('option', { name: 'Servicios' })

    fireEvent.keyDown(combobox, { key: 'Escape' })

    expect(combobox).toHaveValue('serv')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('narrows the option list to categories matching typed text, case-insensitively', async () => {
    await renderForm()
    const combobox = screen.getByRole('combobox', { name: 'Category' })

    fireEvent.change(combobox, { target: { value: 'SERV' } })

    expect(
      await screen.findByRole('option', { name: 'Servicios' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Comida' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('closes the list when Enter is pressed on free text with no option highlighted', async () => {
    await renderForm()
    const combobox = screen.getByRole('combobox', { name: 'Category' })

    fireEvent.change(combobox, { target: { value: 'Cultura' } })
    await screen.findByText('No matching categories')
    expect(combobox).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(combobox, { key: 'Enter' })

    expect(combobox).toHaveValue('Cultura')
    expect(combobox).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('does not silently select a stale highlighted option after the list closes from an outside interaction', async () => {
    await renderForm()
    const combobox = screen.getByRole('combobox', { name: 'Category' })

    fireEvent.focus(combobox)
    await screen.findByRole('listbox', { name: 'Categories' })
    fireEvent.keyDown(combobox, { key: 'ArrowDown' })
    await screen.findByRole('option', { name: 'Comida' })

    // Close the way Radix's dismissable layer does on an outside pointer
    // interaction (pointerdown then click, its outside-click detection
    // pattern), not via this component's own Escape/select handlers. The
    // click lands elsewhere inside the sheet content (not `document.body`)
    // so it dismisses only the popover, not the sheet itself.
    const sheetContent = document.querySelector('[data-slot="sheet-content"]')
    expect(sheetContent).not.toBeNull()
    fireEvent.pointerDown(sheetContent as Element)
    fireEvent.click(sheetContent as Element)
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    fireEvent.focus(combobox)
    await screen.findByRole('listbox', { name: 'Categories' })
    fireEvent.keyDown(combobox, { key: 'Enter' })

    expect(combobox).toHaveValue('')
  })

  it('shows an empty state when the household has no categories yet', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      listCategories: async () => [],
    }
    renderWithProviders(
      <AddExpenseSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    await screen.findByLabelText('Name')

    const combobox = screen.getByRole('combobox', { name: 'Category' })
    fireEvent.focus(combobox)

    expect(
      await screen.findByText('No matching categories'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
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
        <AddExpenseSheetHarness
          db={db}
          householdId={household.id}
          memberId="user-1"
          authorDisplayName="Ada"
        />
        <MonthExpenseCount db={db} householdId={household.id} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    await screen.findByLabelText('Name')

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

  it('shows which Firestore operation was denied when saving the category', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      findOrCreateCategory: async () => {
        throw new FirestoreDeniedError({
          operation: 'findOrCreateCategory',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddExpenseSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    await screen.findByLabelText('Name')

    fillExpense({
      name: 'Pizza',
      price: '12.5',
      category: 'Comida',
    })
    submitExpense()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save category: Missing or insufficient permissions.',
    )
  })

  it('shows which Firestore operation was denied when adding the expense', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      createExpense: async () => {
        throw new FirestoreDeniedError({
          operation: 'createExpense',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddExpenseSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))
    await screen.findByLabelText('Name')

    fillExpense({
      name: 'Pizza',
      price: '12.5',
      category: 'Comida',
    })
    submitExpense()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add expense: Missing or insufficient permissions.',
    )
  })

  it('shows which Firestore operation failed when categories cannot load', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      listCategories: async () => {
        throw new FirestoreDeniedError({
          operation: 'listCategories',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddExpenseSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load categories: Missing or insufficient permissions.',
    )
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

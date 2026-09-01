import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  createExpense,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseSheet } from './AddExpenseSheet'
import type { AddExpenseSheetProps } from './AddExpenseSheet'
import type { EditExpenseTarget } from './AddExpenseForm'

function AddExpenseSheetHarness(
  props: Omit<AddExpenseSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddExpenseSheet open={open} onOpenChange={setOpen} {...props} />
}

// Mirrors how HomePage wires editExpense: onEditFinished clears it, which is
// what actually lets the sheet close after a dismiss or a save.
function EditAddExpenseSheetHarness(
  props: Omit<
    AddExpenseSheetProps,
    'open' | 'onOpenChange' | 'editExpense' | 'onEditFinished'
  > & {
    readonly initialEditExpense: EditExpenseTarget
  },
): ReactElement {
  const { initialEditExpense, ...rest } = props
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(
    initialEditExpense,
  )
  return (
    <AddExpenseSheet
      open={false}
      onOpenChange={() => {}}
      editExpense={editExpense}
      onEditFinished={() => {
        setEditExpense(null)
      }}
      {...rest}
    />
  )
}

// Lets a test switch which expense is being edited (a direct editExpense
// prop change, e.g. `formKey` remount behavior) without ever closing the
// sheet in between -- something driving the sheet through open/close alone
// can't exercise.
function SwitchEditExpenseHarness(
  props: Omit<
    AddExpenseSheetProps,
    'open' | 'onOpenChange' | 'editExpense' | 'onEditFinished'
  > & {
    readonly first: EditExpenseTarget
    readonly second: EditExpenseTarget
  },
): ReactElement {
  const { first, second, ...rest } = props
  const [editExpense, setEditExpense] = useState<EditExpenseTarget>(first)
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEditExpense(second)
        }}
      >
        Switch to other expense
      </button>
      <AddExpenseSheet
        open={false}
        onOpenChange={() => {}}
        editExpense={editExpense}
        onEditFinished={() => {}}
        {...rest}
      />
    </>
  )
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (reason: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function currentMonthDate(day: number): Date {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(day, now.getDate()),
  )
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

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  return { db, householdId: household.id }
}

describe('AddExpenseSheet', () => {
  it('renders only the trigger button when closed and not editing', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddExpenseSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Add expense' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
  })

  it('opens the shared sheet, pre-filled, when editing, even if open is false', async () => {
    const { db, householdId } = await seedHousehold()
    const editExpense: EditExpenseTarget = {
      expenseId: 'expense-1',
      name: 'Pizza',
      price: 12.5,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <AddExpenseSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={editExpense}
        onEditFinished={() => {}}
      />,
    )

    // The pre-filled edit form is visible immediately -- no trigger click
    // needed, and it's routed through the same sheet chrome as add-mode.
    expect(await screen.findByLabelText('Name')).toHaveValue('Pizza')
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-overlay"]'),
    ).toBeInTheDocument()

    // No "Add expense" trigger: the two flows never coexist on screen, so
    // there's no name collision with the trigger.
    expect(
      screen.queryByRole('button', { name: 'Add expense' }),
    ).not.toBeInTheDocument()
  })

  it('lets editing win when open and editExpense are both true, hiding the trigger and routing dismiss through onEditFinished rather than onOpenChange', async () => {
    const { db, householdId } = await seedHousehold()
    const editExpense: EditExpenseTarget = {
      expenseId: 'expense-1',
      name: 'Pizza',
      price: 12.5,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }
    const onOpenChange = vi.fn()
    const onEditFinished = vi.fn()

    renderWithProviders(
      <AddExpenseSheet
        open={true}
        onOpenChange={onOpenChange}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={editExpense}
        onEditFinished={onEditFinished}
      />,
    )

    // Edit-mode wins: the edit form (not the add form) renders, and the
    // trigger stays hidden even though `open` is also true.
    expect(await screen.findByLabelText('Name')).toHaveValue('Pizza')
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add expense' }),
    ).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
    // Dismissing while editing must never fall through to add-mode's own
    // callback, even though `open` (add-mode's own signal) is also true.
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('discards unsaved edit changes on an outside click, the same as Escape', async () => {
    const { db, householdId } = await seedHousehold()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const expense = await createExpense({
      db,
      householdId,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <EditAddExpenseSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        initialEditExpense={editExpense}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Unsaved change' },
    })

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

    const listed = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([expect.objectContaining({ name: 'Pizza' })])
  })

  it('discards unsaved edit changes when the sheet close control is clicked', async () => {
    const { db, householdId } = await seedHousehold()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const expense = await createExpense({
      db,
      householdId,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <EditAddExpenseSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        initialEditExpense={editExpense}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Unsaved change' },
    })

    const closeControl = document.querySelector('[data-slot="sheet-close"]')
    expect(closeControl).not.toBeNull()
    fireEvent.click(closeControl as Element)

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })

    const listed = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([expect.objectContaining({ name: 'Pizza' })])
  })

  it('switching editExpense directly to a different expense resets the fields, discarding the prior unsaved draft', async () => {
    const { db, householdId } = await seedHousehold()
    const first: EditExpenseTarget = {
      expenseId: 'expense-1',
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }
    const second: EditExpenseTarget = {
      expenseId: 'expense-2',
      name: 'Movie tickets',
      price: 25,
      categoryName: 'Servicios',
      comments: 'Weekend',
      expenseDate: currentMonthDate(10),
    }

    renderWithProviders(
      <SwitchEditExpenseHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        first={first}
        second={second}
      />,
    )

    expect(await screen.findByLabelText('Name')).toHaveValue('Pizza')
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unsaved edit of first expense' },
    })

    // The switch button lives outside the Sheet's Dialog.Content portal, so
    // Radix marks it aria-hidden while the dialog is open (correct
    // behavior for real inert background content) -- opt into querying it
    // anyway, the same as clicking it would still work for a sighted user.
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Switch to other expense',
        hidden: true,
      }),
    )

    // The remount (via `formKey`) must show the second expense's own data --
    // not the first expense's unsaved draft, and not a merge of the two.
    expect(screen.getByLabelText('Name')).toHaveValue('Movie tickets')
    expect(screen.getByLabelText('Price')).toHaveValue('25')
    expect(screen.getByLabelText('Category')).toHaveValue('Servicios')
    expect(screen.getByLabelText('Comments')).toHaveValue('Weekend')
  })

  it('calls onEditFinished after a successful save routed through the sheet component', async () => {
    const { db, householdId } = await seedHousehold()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const expense = await createExpense({
      db,
      householdId,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })
    const onEditFinished = vi.fn()
    const onOpenChange = vi.fn()
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <AddExpenseSheet
        open={false}
        onOpenChange={onOpenChange}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={editExpense}
        onEditFinished={onEditFinished}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pasta' },
    })
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
    // A successful edit save must never fall through to add-mode's own
    // onOpenChange(false) callback -- the two flows have separate exits.
    expect(onOpenChange).not.toHaveBeenCalled()
    const listed = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([expect.objectContaining({ name: 'Pasta' })])
  })

  it('discards unsaved edit changes immediately on dismiss, with no confirmation prompt', async () => {
    const { db, householdId } = await seedHousehold()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const expense = await createExpense({
      db,
      householdId,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <EditAddExpenseSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        initialEditExpense={editExpense}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Unsaved change' },
    })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })

    const listed = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([expect.objectContaining({ name: 'Pizza' })])
  })

  it('keeps the edit sheet open while a submit is in flight, ignoring a dismiss attempt until it settles', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({
      db: base,
      householdId: household.id,
    })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const expense = await createExpense({
      db: base,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 10,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })
    const update = deferred<never>()
    const db: HouseholdsDb = {
      ...base,
      updateExpense: async () => update.promise,
    }
    const onEditFinished = vi.fn()
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    }

    renderWithProviders(
      <AddExpenseSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={editExpense}
        onEditFinished={onEditFinished}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pasta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    // The mutation is still pending: an Escape dismiss attempt must be a
    // no-op rather than unmounting the form (and discarding the outcome)
    // out from under it -- the same guard #70 built for add-mode.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(onEditFinished).not.toHaveBeenCalled()

    update.reject(new Error('Network blip'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network blip')
    expect(screen.getByLabelText('Name')).toHaveValue('Pasta')

    // Once the mutation has settled, the dismiss guard must release: a
    // second Escape now closes the sheet as normal.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
  })

  it('restores focus to the trigger button after the sheet closes', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddExpenseSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Add expense' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    await screen.findByLabelText('Name')
    expect(trigger).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Add expense' })).toHaveFocus()
  })

  it('keeps the sheet open while a submit is in flight, so a failure that arrives after a dismiss attempt is still shown', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const create = deferred<never>()
    const db: HouseholdsDb = {
      ...base,
      createExpense: async () => create.promise,
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
    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Price'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    // The mutation is still pending: an Escape dismiss attempt must be a
    // no-op rather than unmounting the form out from under it.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    create.reject(new Error('Network blip'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network blip')
    // Still open and showing the failed draft -- nothing was silently lost.
    expect(screen.getByLabelText('Name')).toHaveValue('Pizza')

    // Once the mutation has settled, the dismiss guard must release: a
    // second Escape now closes the sheet as normal.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    })
  })
})

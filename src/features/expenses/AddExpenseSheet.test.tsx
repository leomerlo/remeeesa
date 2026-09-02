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
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
  })

  it('opens editing through the same sheet used for adding, even if open is false', async () => {
    const { db, householdId } = await seedHousehold()
    const editExpense: EditExpenseTarget = {
      expenseId: 'expense-1',
      name: 'Pizza',
      price: 12.5,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
      memberId: 'user-1',
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

    // The edit form is visible immediately -- no trigger click needed --
    // inside the same Sheet chrome the add flow uses, titled for editing.
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Pizza')
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
    const sheetContent = document.querySelector('[data-slot="sheet-content"]')
    expect(sheetContent).not.toBeNull()
    expect(sheetContent).toHaveTextContent('Editar gasto')

    // No "Add expense" trigger while the sheet is open editing: the two
    // flows never coexist on screen, so there's no name collision.
    expect(
      screen.queryByRole('button', { name: 'Agregar gasto' }),
    ).not.toBeInTheDocument()
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
    const editExpense: EditExpenseTarget = {
      expenseId: expense.id,
      name: 'Pizza',
      price: 10,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
      memberId: 'user-1',
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
        onEditFinished={onEditFinished}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pasta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
    const listed = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(listed).toEqual([expect.objectContaining({ name: 'Pasta' })])
  })

  it('calls onEditFinished when the edit sheet is dismissed without saving', async () => {
    const { db, householdId } = await seedHousehold()
    const onEditFinished = vi.fn()
    const editExpense: EditExpenseTarget = {
      expenseId: 'expense-1',
      name: 'Pizza',
      price: 12.5,
      categoryName: 'Comida',
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
      memberId: 'user-1',
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
        onEditFinished={onEditFinished}
      />,
    )

    await screen.findByLabelText('Nombre')
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

    const trigger = screen.getByRole('button', { name: 'Agregar gasto' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    await screen.findByLabelText('Nombre')
    expect(trigger).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Agregar gasto' })).toHaveFocus()
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

    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    // The mutation is still pending: an Escape dismiss attempt must be a
    // no-op rather than unmounting the form out from under it.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()

    create.reject(new Error('Network blip'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network blip')
    // Still open and showing the failed draft -- nothing was silently lost.
    expect(screen.getByLabelText('Nombre')).toHaveValue('Pizza')

    // Once the mutation has settled, the dismiss guard must release: a
    // second Escape now closes the sheet as normal.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
  })
})

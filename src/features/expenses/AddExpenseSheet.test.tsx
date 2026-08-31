import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseSheet } from './AddExpenseSheet'
import type { EditExpenseTarget } from './AddExpenseForm'

function currentMonthDate(day: number): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), Math.min(day, now.getDate()))
}

function currentMonthRange(now = new Date()): {
  readonly monthStart: Date
  readonly monthEnd: Date
} {
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    monthEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
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

  it('bypasses the sheet entirely and renders the edit form inline when editing, even if open is true', async () => {
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
        open={true}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={editExpense}
        onEditFinished={() => {}}
      />,
    )

    // The inline edit form is visible immediately -- no trigger click needed.
    expect(await screen.findByLabelText('Name')).toHaveValue('Pizza')
    expect(
      screen.getByRole('button', { name: 'Save changes' }),
    ).toBeInTheDocument()

    // No sheet chrome and no "Add expense" trigger: the two flows never
    // coexist on screen, so there's no name collision with the trigger.
    expect(
      screen.queryByRole('button', { name: 'Add expense' }),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-overlay"]'),
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

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pasta' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

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
})

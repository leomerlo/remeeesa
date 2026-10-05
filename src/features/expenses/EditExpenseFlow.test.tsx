import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createExpense,
  deleteExpense,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import {
  createPendiente,
  getPendiente,
  markPendientePaid,
} from '@/lib/pendientes'
import {
  createCard,
  createCardPurchase,
  listCardPurchasesInMonth,
  markResumenPaid,
} from '@/lib/cards'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { MemoryRouter } from 'react-router-dom'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddExpenseForm } from './AddExpenseForm'
import type { EditExpenseTarget } from './AddExpenseForm'
import { RecentExpensesList } from './RecentExpensesList'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'

// The edit form links to Ajustes when the household has no payment method
// written down, so it needs a router around it -- exactly as it has in the
// app, where it only ever renders inside one.
function renderInRouter(
  ui: ReactNode,
  options?: Parameters<typeof renderWithProviders>[1],
): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>, options)
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
            memberId: expense.memberId,
            pendienteId: expense.pendienteId,
            isService: expense.isService,
            currency: expense.currency,
            paymentMethodId: expense.paymentMethodId,
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

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('Pizza')
    // FormattedAmountInput displays with es-AR grouping/decimal ("12,5"),
    // not the raw "12.5" the field's underlying (Number()-parseable) value
    // actually holds.
    expect(screen.getByLabelText('Precio')).toHaveValue('12,5')
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

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(await screen.findByText('$90')).toBeInTheDocument()
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
      expect(screen.getByText('$75')).toBeInTheDocument()
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

    renderInRouter(
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

    renderInRouter(
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
      expect(screen.getByText('Todavía no anotaron nada')).toBeInTheDocument()
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
      displayName: 'Ada',
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
    renderInRouter(
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

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(
      await screen.findByRole('status', {
        name: /^Te quedan \$70\./,
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
      await screen.findByText('Todavía no anotaron nada'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: /^Te quedan \$100\./ }),
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

    renderInRouter(
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

  it('reassigns an expense to a different household member via the Autor picker', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Florencia',
    })
    store.seedMembership({
      userId: 'user-2',
      householdId: household.id,
      displayName: 'Leo',
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Gimnasio',
      price: 10,
    })

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Florencia"
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Gimnasio' }),
    )
    const authorSelect = await screen.findByLabelText('Autor')
    expect(authorSelect).toHaveValue('user-1')

    fireEvent.change(authorSelect, { target: { value: 'user-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(async () => {
      const [updated] = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(updated).toEqual(
        expect.objectContaining({
          memberId: 'user-2',
          authorDisplayName: 'Leo',
        }),
      )
    })
  })

  // A household's credit cards are deliberately not offered here: what you
  // pay with credit does not leave this month, it lands in next month's
  // Resumen, so moving a saved gasto onto one would be a different record
  // rather than an edit. They used to just be absent, which read as a list
  // missing half the cards. Per direct feedback.
  it('says why the credit cards are not among the methods offered', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100000,
    })
    await createCard({
      db,
      householdId: household.id,
      name: 'Visa Flor',
      kind: 'credito',
      currency: 'BOTH',
      brand: 'visa',
    })
    await createCard({
      db,
      householdId: household.id,
      name: 'Mercado Pago',
      kind: 'cuenta',
      currency: 'ARS',
      brand: 'mercadopago',
    })
    await seedCurrentMonthExpense({
      db,
      householdId: household.id,
      name: 'Luz',
      price: 36800,
    })

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))

    const methods = await screen.findByLabelText('Método de pago')
    expect(
      within(methods).getByRole('option', { name: 'Mercado Pago' }),
    ).toBeInTheDocument()
    expect(
      within(methods).queryByRole('option', { name: 'Visa Flor' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/tarjetas de crédito no están en esta lista/i),
    ).toBeInTheDocument()
  })

  // Recurrente replaced the old "Marcar como servicio" switch, which only
  // ever set a flag: the gasto showed up under Servicios but never came
  // back the following month, because recurrence lives on a Pendiente and
  // a plain Expense has none. Turning it on now rebuilds the record as the
  // Pendiente the alta would have created. Per direct feedback.
  it('turns a plain gasto into a real servicio when Recurrente is switched on', async () => {
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
      name: 'Gimnasio',
      price: 10,
    })

    renderInRouter(
      <EditExpenseHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Gimnasio' }),
    )
    const toggle = await screen.findByLabelText('Recurrente')
    expect(toggle).not.toBeChecked()

    fireEvent.click(toggle)
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar como servicio' }),
    )

    // The money is still spent exactly once, and now through a Pendiente.
    await waitFor(async () => {
      const expenses = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(expenses).toHaveLength(1)
      expect(expenses[0]?.pendienteId).not.toBeNull()
      expect(expenses[0]?.price).toBe(10)
    })
    const [converted] = await listExpensesInMonth({
      db,
      householdId: household.id,
      ...currentMonthRange(),
    })
    expect(
      await getPendiente({
        db,
        householdId: household.id,
        pendienteId: converted?.pendienteId ?? '',
      }),
    ).toEqual(
      expect.objectContaining({
        name: 'Gimnasio',
        recurring: true,
        status: 'paid',
      }),
    )
  })

  // Switching it off turns the bill back into something owed: the Expense
  // goes, the Pendiente comes back pending, and the edits made in the same
  // save land on it.
  it('puts a servicio back to pending when "Ya lo pagué" is switched off', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 10000,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: currentMonthDate(10),
      expectedAmount: 5000,
    })
    const { expense } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: currentMonthDate(10),
    })

    renderInRouter(
      <AddExpenseForm
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={{
          expenseId: expense.id,
          name: expense.name,
          price: expense.price,
          categoryName: 'Comida',
          comments: expense.comments,
          expenseDate: expense.expenseDate,
          memberId: expense.memberId,
          pendienteId: expense.pendienteId,
          isService: expense.isService,
          currency: expense.currency,
          paymentMethodId: expense.paymentMethodId,
        }}
      />,
    )

    fireEvent.click(await screen.findByLabelText('Ya lo pagué'))
    fireEvent.change(screen.getByLabelText('Monto esperado'), {
      target: { value: '5200' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar impago' }),
    )

    await waitFor(async () => {
      const reloaded = await getPendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
      })
      expect(reloaded).toEqual(
        expect.objectContaining({ status: 'pending', expectedAmount: 5200 }),
      )
    })
    expect(
      await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      }),
    ).toEqual([])
  })

  // A servicio's recurrence lives on its Pendiente, so the switch shows
  // what that says -- and saving writes back to it, paid or not. A paid
  // Pendiente is otherwise frozen; these two keys have their own door in
  // the rules precisely because what they decide is still ahead.
  it("reads and writes a servicio's recurrence through its Pendiente", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 10000,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: currentMonthDate(10),
      expectedAmount: 5000,
      recurring: true,
    })
    const { expense } = await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: currentMonthDate(10),
    })

    renderInRouter(
      <AddExpenseForm
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={{
          expenseId: expense.id,
          name: expense.name,
          price: expense.price,
          categoryName: 'Comida',
          comments: expense.comments,
          expenseDate: expense.expenseDate,
          memberId: expense.memberId,
          pendienteId: expense.pendienteId,
          isService: expense.isService,
          currency: expense.currency,
          paymentMethodId: expense.paymentMethodId,
        }}
      />,
    )

    expect(await screen.findByLabelText('Recurrente')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Débito automático'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(async () => {
      const reloaded = await getPendiente({
        db,
        householdId: household.id,
        pendienteId: pendiente.id,
      })
      expect(reloaded).toEqual(
        expect.objectContaining({
          recurring: true,
          autoDebit: true,
          // Still paid: recurrence changed, the payment did not.
          status: 'paid',
        }),
      )
    })
  })
})

describe('deleting an expense a Resumen payment generated', () => {
  it('undoes the whole payment: every cuota expense and the ajuste go, the Resumen is pending again and its purchases unlock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    try {
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa',
        monthlyBudget: 1000,
      })
      const householdId = household.id
      const [category] = await listCategories({ db, householdId })
      if (category === undefined) {
        throw new Error('expected a seeded category')
      }
      const visa = await createCard({ db, householdId, name: 'Visa' })
      for (const name of ['Zapatillas', 'Remera']) {
        await createCardPurchase({
          db,
          householdId,
          cardId: visa.id,
          categoryId: category.id,
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name,
          total: 100,
          cuotas: 1,
          purchaseDate: new Date(2026, 8, 5),
          comments: '',
        })
      }
      const resumenId = `${visa.id}_2026-10`
      const { expenses } = await markResumenPaid({
        db,
        householdId,
        resumenId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        amountPaid: 210,
        paymentDate: new Date(2026, 9, 15),
      })
      const [first] = expenses
      if (first === undefined) {
        throw new Error('expected a cuota expense')
      }

      renderInRouter(
        <AddExpenseForm
          db={db}
          householdId={householdId}
          memberId="user-1"
          authorDisplayName="Ada"
          editExpense={{
            expenseId: first.id,
            name: first.name,
            price: first.price,
            categoryName: 'Tarjeta',
            comments: first.comments,
            expenseDate: first.expenseDate,
            memberId: first.memberId,
            pendienteId: first.pendienteId,
            isService: first.isService,
            currency: first.currency,
            paymentMethodId: first.paymentMethodId,
          }}
        />,
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Deshacer pago' }),
      )
      fireEvent.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Deshacer pago',
        }),
      )

      const range = {
        monthStart: new Date(2026, 9, 1),
        monthEnd: new Date(2026, 9, 31, 23, 59, 59, 999),
      }
      await waitFor(async () => {
        expect(
          await listExpensesInMonth({ db, householdId, ...range }),
        ).toEqual([])
      })
      expect(
        (await getPendiente({ db, householdId, pendienteId: resumenId }))
          ?.status,
      ).toBe('pending')
      const purchases = await listCardPurchasesInMonth({
        db,
        householdId,
        monthStart: new Date(2026, 8, 1),
        monthEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
      })
      expect(purchases.map((p) => p.paidResumenIds)).toEqual([[], []])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('editing a Resumen ajuste', () => {
  it("can't be saved, only undone, since a saved expense can't be negative", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa',
      monthlyBudget: 1000,
    })

    renderInRouter(
      <AddExpenseForm
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
        editExpense={{
          expenseId: 'ajuste',
          name: 'Visa — ajuste',
          price: -10,
          categoryName: 'Tarjeta',
          comments: '',
          expenseDate: new Date(),
          memberId: 'user-1',
          pendienteId: 'card-1_2026-10',
          isService: false,
          currency: 'ARS' as const,
          paymentMethodId: null,
        }}
      />,
    )

    expect(
      await screen.findByText(
        'Es el ajuste de un resumen pagado: para cambiarlo, deshacé el pago.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deshacer pago' })).toBeEnabled()
  })
})

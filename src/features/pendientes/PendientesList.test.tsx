import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createPendiente } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { AddPendienteSheetProps } from './AddPendienteSheet'
import { PendientesList } from './PendientesList'

function formatPendienteDueDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function AddPendienteSheetHarness(
  props: Omit<AddPendienteSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddPendienteSheet open={open} onOpenChange={setOpen} {...props} />
}

async function findCategoryId(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly name: string
}): Promise<string> {
  const categories = await listCategories({
    db: input.db,
    householdId: input.householdId,
  })
  const found = categories.find((category) => category.name === input.name)
  if (found === undefined) {
    throw new Error(`expected seeded category ${input.name}`)
  }
  return found.id
}

describe('PendientesList', () => {
  it('shows an empty state when the household has no pending pendientes', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    expect(await screen.findByText('No hay pendientes')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists pending pendientes with name, category, due date, and amount, soonest due first', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const transporteId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Transporte',
    })

    const soonestDueDate = new Date(2026, 8, 5)
    const middleDueDate = new Date(2026, 8, 15)
    const latestDueDate = new Date(2026, 8, 25)

    await createPendiente({
      db,
      householdId: household.id,
      categoryId: transporteId,
      name: 'Seguro auto',
      dueDate: latestDueDate,
      expectedAmount: null,
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Luz',
      dueDate: soonestDueDate,
      expectedAmount: 45,
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: transporteId,
      name: 'Internet',
      dueDate: middleDueDate,
      expectedAmount: 30,
    })

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)

    expect(rows[0]).toHaveTextContent('Luz')
    expect(rows[0]).toHaveTextContent('Comida')
    expect(rows[0]).toHaveTextContent(formatPendienteDueDate(soonestDueDate))
    expect(rows[0]).toHaveTextContent('$45')

    expect(rows[1]).toHaveTextContent('Internet')
    expect(rows[1]).toHaveTextContent('Transporte')
    expect(rows[1]).toHaveTextContent(formatPendienteDueDate(middleDueDate))
    expect(rows[1]).toHaveTextContent('$30')

    expect(rows[2]).toHaveTextContent('Seguro auto')
    expect(rows[2]).toHaveTextContent('Transporte')
    expect(rows[2]).toHaveTextContent(formatPendienteDueDate(latestDueDate))
    // 'Seguro auto' was created with expectedAmount: null -- no amount should
    // render for it.
    expect(rows[2]).not.toHaveTextContent('$')
  })

  it('shows a placeholder amount for a recurring pendiente with no expected amount yet', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Gimnasio',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: null,
      recurring: true,
    })

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    const row = await screen.findByText('Gimnasio')
    expect(row.closest('li')).toHaveTextContent('$ --,--')
  })

  it('does not show a manually-seeded paid pendiente in the same household', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const pending = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Pendiente',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: 10,
    })
    const paidPendiente: Pendiente = {
      id: 'paid-pendiente-1',
      householdId: household.id,
      categoryId: comidaId,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 20,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      paidAt: new Date(),
      createdAt: new Date(),
    }
    store.seedPendiente(paidPendiente)

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    expect(await screen.findByText(pending.name)).toBeInTheDocument()
    expect(screen.queryByText('Ya pagada')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('does not show a pendiente from a different household', async () => {
    const store = createMemoryHouseholdsDb()
    const db1 = store.asUser('user-1')
    const household1 = await createHouseholdWithMembership({
      db: db1,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db2 = store.asUser('user-2')
    const household2 = await createHouseholdWithMembership({
      db: db2,
      userId: 'user-2',
      name: 'Casa Azul',
      monthlyBudget: 100,
    })
    const comida2Id = await findCategoryId({
      db: db2,
      householdId: household2.id,
      name: 'Comida',
    })
    await createPendiente({
      db: db2,
      householdId: household2.id,
      categoryId: comida2Id,
      name: 'Pendiente de la otra casa',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: 15,
    })

    renderWithProviders(<PendientesList db={db1} householdId={household1.id} />)

    expect(await screen.findByText('No hay pendientes')).toBeInTheDocument()
    expect(
      screen.queryByText('Pendiente de la otra casa'),
    ).not.toBeInTheDocument()
  })

  it('reflects a newly created pendiente without a manual refetch', async () => {
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
        <PendientesList db={db} householdId={household.id} />
        <AddPendienteSheetHarness
          db={db}
          householdId={household.id}
          memberId="user-1"
          authorDisplayName="Ada"
        />
      </>,
      { queryClient },
    )

    expect(await screen.findByText('No hay pendientes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar Servicio' }))
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Servicios' },
    })
    fireEvent.change(screen.getByLabelText('Fecha de vencimiento'), {
      target: { value: '2026-09-10' },
    })
    fireEvent.change(screen.getByLabelText('Monto esperado'), {
      target: { value: '500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar recurrente' }))

    await waitFor(() => {
      expect(screen.getByText('Alquiler')).toBeInTheDocument()
    })
    expect(screen.queryByText('No hay pendientes')).not.toBeInTheDocument()
  })

  it('shows an error when loading pending pendientes fails', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      listPendientes: async () => {
        throw new Error('No se pudieron cargar los pendientes')
      },
    }

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar los pendientes',
    )
  })

  it('renders a plain div with no button when onEditPendiente is omitted', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    expect(await screen.findByText('Alquiler')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar Alquiler' }),
    ).not.toBeInTheDocument()
  })

  it('renders each row as a button and calls onEditPendiente with the pendiente and its category name when tapped', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    const onEditPendiente = vi.fn()

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onEditPendiente={onEditPendiente}
      />,
    )

    const row = await screen.findByRole('button', { name: 'Editar Alquiler' })
    fireEvent.click(row)

    expect(onEditPendiente).toHaveBeenCalledTimes(1)
    expect(onEditPendiente).toHaveBeenCalledWith(pendiente, 'Comida')
  })

  // Per direct feedback: the row's two actions are Pagar and Editar, both
  // spelled out, with Pagar the primary of the two. Editar used to be the
  // whole row being silently tappable, which nothing on screen announced.
  it('offers Pagar and Editar as visible buttons, with Pagar the primary one', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 0, 10),
      expectedAmount: 500,
    })

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onMarkPaid={vi.fn()}
        onEditPendiente={vi.fn()}
      />,
    )

    const pagar = await screen.findByRole('button', {
      name: 'Marcar pagado Alquiler',
    })
    const editar = screen.getByRole('button', { name: 'Editar Alquiler' })
    expect(pagar).toHaveTextContent('Pagar')
    expect(editar).toHaveTextContent('Editar')
    // The hierarchy itself: only Pagar is filled with the action colour.
    expect(pagar).toHaveClass('bg-primary')
    expect(editar).not.toHaveClass('bg-primary')
  })

  it('renders a "Pagar" control per row and calls onMarkPaid with the pendiente when clicked, not onEditPendiente', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    const onEditPendiente = vi.fn()
    const onMarkPaid = vi.fn()

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onEditPendiente={onEditPendiente}
        onMarkPaid={onMarkPaid}
      />,
    )

    const payButton = await screen.findByRole('button', {
      name: 'Marcar pagado Alquiler',
    })
    fireEvent.click(payButton)

    expect(onMarkPaid).toHaveBeenCalledTimes(1)
    expect(onMarkPaid).toHaveBeenCalledWith(pendiente, 'Comida')
    expect(onEditPendiente).not.toHaveBeenCalled()
  })

  it('still calls onEditPendiente when the row body is tapped, unaffected by the added Pagar button', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    const onEditPendiente = vi.fn()
    const onMarkPaid = vi.fn()

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onEditPendiente={onEditPendiente}
        onMarkPaid={onMarkPaid}
      />,
    )

    const editButton = await screen.findByRole('button', {
      name: 'Editar Alquiler',
    })
    fireEvent.click(editButton)

    expect(onEditPendiente).toHaveBeenCalledTimes(1)
    expect(onEditPendiente).toHaveBeenCalledWith(pendiente, 'Comida')
    expect(onMarkPaid).not.toHaveBeenCalled()
  })

  it('renders the row body as a plain div (not a button) when onMarkPaid is supplied without onEditPendiente, and the Pagar control still works', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const comidaId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Comida',
    })
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    const onMarkPaid = vi.fn()

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onMarkPaid={onMarkPaid}
      />,
    )

    expect(await screen.findByText('Alquiler')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar Alquiler' }),
    ).not.toBeInTheDocument()

    const payButton = screen.getByRole('button', {
      name: 'Marcar pagado Alquiler',
    })
    fireEvent.click(payButton)

    expect(onMarkPaid).toHaveBeenCalledTimes(1)
    expect(onMarkPaid).toHaveBeenCalledWith(pendiente, 'Comida')
  })

  // The name, the amount and "Pagar" used to share one line, which at 375px
  // clipped "Expensas" to "Expen…" and squashed the button into a flattened
  // oval. The button gets its own row now.
  it('shows a long bill name in full, alongside its amount', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categoryId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Servicios',
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId,
      name: 'Expensas',
      dueDate: new Date('2026-12-09T12:00:00'),
      expectedAmount: 145000,
    })

    renderWithProviders(
      <PendientesList
        db={db}
        householdId={household.id}
        onMarkPaid={() => {}}
      />,
    )

    const row = (await screen.findByText('Expensas')).closest('li')
    expect(row).toHaveTextContent('Expensas')
    expect(row).toHaveTextContent('$145.000,00')
    expect(
      within(row as HTMLElement).getByRole('button', {
        name: 'Marcar pagado Expensas',
      }),
    ).toBeInTheDocument()
  })

  // The circles were empty colour blobs here while every other list in the
  // app puts the category's icon inside them.
  it('puts the category icon inside the coloured circle', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categoryId = await findCategoryId({
      db,
      householdId: household.id,
      name: 'Servicios',
    })
    await createPendiente({
      db,
      householdId: household.id,
      categoryId,
      name: 'Luz',
      dueDate: new Date('2026-12-04T12:00:00'),
      expectedAmount: 28000,
    })

    renderWithProviders(<PendientesList db={db} householdId={household.id} />)

    await screen.findByText('Luz')
    const icon = screen.getByTestId('category-icon')
    expect(icon.querySelector('svg')).not.toBeNull()
  })
})

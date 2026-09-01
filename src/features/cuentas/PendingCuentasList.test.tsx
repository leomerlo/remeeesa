import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createCuenta } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { AddCuentaSheetProps } from './AddCuentaSheet'
import { PendingCuentasList } from './PendingCuentasList'

function formatCuentaDueDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function AddCuentaSheetHarness(
  props: Omit<AddCuentaSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddCuentaSheet open={open} onOpenChange={setOpen} {...props} />
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

describe('PendingCuentasList', () => {
  it('shows an empty state when the household has no pending cuentas', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <PendingCuentasList db={db} householdId={household.id} />,
    )

    expect(await screen.findByText('No hay cuentas pendientes')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists pending cuentas with name, category, due date, and amount, soonest due first', async () => {
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

    await createCuenta({
      db,
      householdId: household.id,
      categoryId: transporteId,
      name: 'Seguro auto',
      dueDate: latestDueDate,
      expectedAmount: null,
    })
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Luz',
      dueDate: soonestDueDate,
      expectedAmount: 45,
    })
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: transporteId,
      name: 'Internet',
      dueDate: middleDueDate,
      expectedAmount: 30,
    })

    renderWithProviders(
      <PendingCuentasList db={db} householdId={household.id} />,
    )

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)

    expect(rows[0]).toHaveTextContent('Luz')
    expect(rows[0]).toHaveTextContent('Comida')
    expect(rows[0]).toHaveTextContent(formatCuentaDueDate(soonestDueDate))
    expect(rows[0]).toHaveTextContent('$45')

    expect(rows[1]).toHaveTextContent('Internet')
    expect(rows[1]).toHaveTextContent('Transporte')
    expect(rows[1]).toHaveTextContent(formatCuentaDueDate(middleDueDate))
    expect(rows[1]).toHaveTextContent('$30')

    expect(rows[2]).toHaveTextContent('Seguro auto')
    expect(rows[2]).toHaveTextContent('Transporte')
    expect(rows[2]).toHaveTextContent(formatCuentaDueDate(latestDueDate))
    // 'Seguro auto' was created with expectedAmount: null -- no amount should
    // render for it.
    expect(rows[2]).not.toHaveTextContent('$')
  })

  it('does not show a manually-seeded paid cuenta in the same household', async () => {
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
    const pending = await createCuenta({
      db,
      householdId: household.id,
      categoryId: comidaId,
      name: 'Pendiente',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: 10,
    })
    const paidCuenta: Cuenta = {
      id: 'paid-cuenta-1',
      householdId: household.id,
      categoryId: comidaId,
      name: 'Ya pagada',
      dueDate: new Date(2026, 8, 1),
      expectedAmount: 20,
      recurring: false,
      status: 'paid',
      paidExpenseId: 'expense-1',
      createdAt: new Date(),
    }
    store.seedCuenta(paidCuenta)

    renderWithProviders(
      <PendingCuentasList db={db} householdId={household.id} />,
    )

    expect(await screen.findByText(pending.name)).toBeInTheDocument()
    expect(screen.queryByText('Ya pagada')).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('does not show a cuenta from a different household', async () => {
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
    await createCuenta({
      db: db2,
      householdId: household2.id,
      categoryId: comida2Id,
      name: 'Cuenta de la otra casa',
      dueDate: new Date(2026, 8, 5),
      expectedAmount: 15,
    })

    renderWithProviders(
      <PendingCuentasList db={db1} householdId={household1.id} />,
    )

    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Cuenta de la otra casa'),
    ).not.toBeInTheDocument()
  })

  it('reflects a newly created cuenta without a manual refetch', async () => {
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
        <PendingCuentasList db={db} householdId={household.id} />
        <AddCuentaSheetHarness db={db} householdId={household.id} />
      </>,
      { queryClient },
    )

    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }))

    await waitFor(() => {
      expect(screen.getByText('Alquiler')).toBeInTheDocument()
    })
    expect(
      screen.queryByText('No hay cuentas pendientes'),
    ).not.toBeInTheDocument()
  })

  it('shows an error when loading pending cuentas fails', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      listPendingCuentas: async () => {
        throw new Error('No se pudieron cargar las cuentas')
      },
    }

    renderWithProviders(
      <PendingCuentasList db={db} householdId={household.id} />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron cargar las cuentas',
    )
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { currentMonthRange, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddGastoSheet } from './AddGastoSheet'
import type { AddGastoSheetProps } from './AddGastoSheet'

function AddGastoSheetHarness(
  props: Omit<AddGastoSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddGastoSheet open={open} onOpenChange={setOpen} {...props} />
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
    <AddGastoSheetHarness
      db={db}
      householdId={household.id}
      memberId="user-1"
      authorDisplayName="Ada"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))
  await screen.findByLabelText('Nombre')
  return { db, householdId: household.id }
}

function fillCommon(fields: {
  readonly name: string
  readonly category: string
}): void {
  fireEvent.change(screen.getByLabelText('Nombre'), {
    target: { value: fields.name },
  })
  fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
    target: { value: fields.category },
  })
}

describe('AddGastoSheet (unified add flow)', () => {
  it('starts with "Ya lo pagué" checked, showing Precio and Fecha', async () => {
    await renderForm()

    expect(screen.getByLabelText('Ya lo pagué')).toBeChecked()
    expect(screen.getByLabelText('Recurrente')).not.toBeChecked()
    expect(screen.getByLabelText('Precio')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
  })

  it('creates a plain Expense when not recurring and already paid (the default)', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Café', category: 'Comida' })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '2500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })

    const expenses = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(expenses).toEqual([
      expect.objectContaining({ name: 'Café', price: 2500, pendienteId: null }),
    ])
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('creates a pending, not-yet-paid Pendiente when "Ya lo pagué" is unchecked', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Seguro auto', category: 'Otros' })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))

    expect(screen.getByLabelText('Monto esperado')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar pendiente' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar pendiente' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })

    const pendientes = await listPendientes({ db, householdId })
    expect(pendientes).toEqual([
      expect.objectContaining({
        name: 'Seguro auto',
        expectedAmount: null,
        recurring: false,
        status: 'pending',
      }),
    ])
    expect(
      await listExpensesInMonth({ db, householdId, ...currentMonthRange() }),
    ).toEqual([])
  })

  it('creates a recurring, not-yet-paid Pendiente when both switches are set accordingly', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Netflix', category: 'Otros' })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(screen.getByLabelText('Recurrente'))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar recurrente' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })

    expect(await listPendientes({ db, householdId })).toEqual([
      expect.objectContaining({
        name: 'Netflix',
        recurring: true,
        status: 'pending',
      }),
    ])
  })

  it('creates and immediately pays a recurring Pendiente when both switches stay checked', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Gimnasio', category: 'Otros' })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '8000' },
    })
    fireEvent.click(screen.getByLabelText('Recurrente'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Agregar y marcar pagado' }),
    )

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })

    // Paid immediately, so nothing shows up as still pending under its
    // original name -- only the next cycle (a fresh id, one month later).
    const pendientes = await listPendientes({ db, householdId })
    expect(pendientes).toHaveLength(1)
    expect(pendientes[0]).toMatchObject({
      name: 'Gimnasio',
      recurring: true,
      status: 'pending',
      expectedAmount: 8000,
    })
    const expenses = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(expenses).toEqual([
      expect.objectContaining({ name: 'Gimnasio', price: 8000 }),
    ])
  })

  it('requires an amount when "Ya lo pagué" is checked', async () => {
    await renderForm()

    fillCommon({ name: 'Café', category: 'Comida' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    expect(await screen.findByText('Ingresá un monto')).toBeInTheDocument()
  })

  it('resets to the default state (paid, not recurring) after a successful add', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Café', category: 'Comida' })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '2500' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      await listExpensesInMonth({ db, householdId, ...currentMonthRange() }),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

    expect(screen.getByLabelText('Nombre')).toHaveValue('')
    expect(screen.getByLabelText('Ya lo pagué')).toBeChecked()
    expect(screen.getByLabelText('Recurrente')).not.toBeChecked()
  })
})

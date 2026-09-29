import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { currentMonthRange, listExpensesInMonth } from '@/lib/expenses'
import { createCard } from '@/lib/cards'
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

async function renderForm(
  options: {
    readonly showRecurringOptions?: boolean
    readonly defaultDueDate?: Date
    readonly cardNames?: readonly string[]
  } = {},
) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  for (const cardName of options.cardNames ?? []) {
    await createCard({ db, householdId: household.id, name: cardName })
  }
  renderWithProviders(
    <MemoryRouter>
      <AddGastoSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
        {...(options.showRecurringOptions === undefined
          ? {}
          : { showRecurringOptions: options.showRecurringOptions })}
        {...(options.defaultDueDate === undefined
          ? {}
          : { defaultDueDate: options.defaultDueDate })}
      />
    </MemoryRouter>,
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
      screen.getByRole('button', { name: 'Agregar servicio' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Agregar servicio' }))

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
    fireEvent.click(screen.getByRole('button', { name: 'Agregar servicio' }))

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

  it('renders the category list inside the modal so it can be scrolled on a touch screen', async () => {
    await renderForm()

    fireEvent.focus(screen.getByRole('combobox', { name: 'Categoría' }))

    const listbox = screen.getByRole('listbox', { name: 'Categorías' })
    const sheetContent = document.querySelector('[data-slot="sheet-content"]')
    expect(sheetContent).not.toBeNull()
    // A modal dialog cancels touch scrolling everywhere except its own
    // content element, so a listbox portalled to document.body could not be
    // dragged at all on a phone.
    expect(sheetContent?.contains(listbox)).toBe(true)
  })

  it('enables Débito automático only while Recurrente is on, and clears it when Recurrente is switched off', async () => {
    await renderForm()

    expect(screen.getByLabelText('Débito automático')).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Recurrente'))
    expect(screen.getByLabelText('Débito automático')).toBeEnabled()

    fireEvent.click(screen.getByLabelText('Débito automático'))
    expect(screen.getByLabelText('Débito automático')).toBeChecked()

    fireEvent.click(screen.getByLabelText('Recurrente'))
    expect(screen.getByLabelText('Débito automático')).toBeDisabled()
    expect(screen.getByLabelText('Débito automático')).not.toBeChecked()
  })

  it('stores autoDebit on the Pendiente it creates', async () => {
    const { db, householdId } = await renderForm()

    fillCommon({ name: 'Netflix', category: 'Servicios' })
    fireEvent.click(screen.getByLabelText('Recurrente'))
    fireEvent.click(screen.getByLabelText('Débito automático'))
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(screen.getByRole('button', { name: 'Agregar servicio' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })

    expect(await listPendientes({ db, householdId })).toEqual([
      expect.objectContaining({
        name: 'Netflix',
        recurring: true,
        autoDebit: true,
      }),
    ])
  })

  it('hides Recurrente and Débito automático when showRecurringOptions is false, keeping "Ya lo pagué" checked', async () => {
    await renderForm({ showRecurringOptions: false })

    expect(screen.queryByLabelText('Recurrente')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Débito automático')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Ya lo pagué')).toBeChecked()
  })

  it('still creates a plain Expense when showRecurringOptions is false', async () => {
    const { db, householdId } = await renderForm({
      showRecurringOptions: false,
    })

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
    ).toEqual([
      expect.objectContaining({ name: 'Café', price: 2500, pendienteId: null }),
    ])
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('opens as a bill due on defaultDueDate when one is given', async () => {
    const now = new Date()
    const { db, householdId } = await renderForm({
      defaultDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    })

    expect(screen.getByLabelText('Ya lo pagué')).not.toBeChecked()
    const nextMonthFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue(
      `${String(nextMonthFirst.getFullYear())}-${String(nextMonthFirst.getMonth() + 1).padStart(2, '0')}-01`,
    )

    fillCommon({ name: 'Colegio', category: 'Educación' })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar servicio' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(await listPendientes({ db, householdId })).toEqual([
      expect.objectContaining({
        name: 'Colegio',
        dueDate: nextMonthFirst,
        status: 'pending',
      }),
    ])
  })

  it('pulls a future date back to today when "Ya lo pagué" is checked', async () => {
    const now = new Date()
    await renderForm({
      defaultDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    })

    fireEvent.click(screen.getByLabelText('Ya lo pagué'))

    expect(screen.getByLabelText('Fecha')).toHaveValue(
      `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    )
  })

  describe('Pagó con', () => {
    it('defaults to "Efectivo / débito" and offers a shortcut to Ajustes when there are no cards', async () => {
      await renderForm()

      const paidWith = screen.getByLabelText('Pagó con')
      expect(paidWith).toHaveValue('')
      expect(
        within(paidWith)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Efectivo / débito'])
      expect(
        await screen.findByRole('link', {
          name: 'Crear una tarjeta en Ajustes',
        }),
      ).toHaveAttribute('href', '/household')
      expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument()
    })

    it('lists the household cards and asks for cuotas, defaulting to 1, once one is picked', async () => {
      await renderForm({ cardNames: ['Visa', 'Amex'] })

      const paidWith = screen.getByLabelText('Pagó con')
      await within(paidWith).findByRole('option', { name: 'Visa' })
      expect(
        screen.queryByRole('link', { name: 'Crear una tarjeta en Ajustes' }),
      ).not.toBeInTheDocument()

      fireEvent.change(paidWith, {
        target: {
          value: within(paidWith)
            .getByRole('option', { name: 'Visa' })
            .getAttribute('value'),
        },
      })

      expect(screen.getByLabelText('Cuotas')).toHaveValue(1)
      expect(screen.getByLabelText('Precio')).toBeInTheDocument()
      expect(screen.queryByLabelText('Ya lo pagué')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Recurrente')).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Agregar compra' }),
      ).toBeInTheDocument()
    })

    async function pickVisa(): Promise<void> {
      const paidWith = screen.getByLabelText('Pagó con')
      const visa = await within(paidWith).findByRole('option', { name: 'Visa' })
      fireEvent.change(paidWith, {
        target: { value: visa.getAttribute('value') },
      })
    }

    it("logs a card purchase as next month's Resumen, not as an expense this month", async () => {
      const { db, householdId } = await renderForm({ cardNames: ['Visa'] })

      fillCommon({ name: 'Zapatillas', category: 'Ropa' })
      fireEvent.change(screen.getByLabelText('Precio'), {
        target: { value: '100' },
      })
      await pickVisa()
      fireEvent.change(screen.getByLabelText('Cuotas'), {
        target: { value: '3' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar compra' }))

      await waitFor(() => {
        expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
      })
      expect(
        await listExpensesInMonth({ db, householdId, ...currentMonthRange() }),
      ).toEqual([])
      const resumenes = await listPendientes({ db, householdId })
      expect(resumenes.map((r) => [r.name, r.expectedAmount])).toEqual([
        ['Visa', 33.33],
        ['Visa', 33.33],
        ['Visa', 33.34],
      ])
    })

    it('rejects cuotas outside 1–24 and writes nothing', async () => {
      const { db, householdId } = await renderForm({ cardNames: ['Visa'] })

      fillCommon({ name: 'Tele', category: 'Otros' })
      fireEvent.change(screen.getByLabelText('Precio'), {
        target: { value: '100' },
      })
      await pickVisa()
      fireEvent.change(screen.getByLabelText('Cuotas'), {
        target: { value: '25' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar compra' }))

      expect(
        await screen.findByText(
          'Las cuotas deben ser un número entero entre 1 y 24',
        ),
      ).toBeInTheDocument()
      expect(await listPendientes({ db, householdId })).toEqual([])
    })

    it('pulls a future due date back to today once a card is picked', async () => {
      const now = new Date()
      await renderForm({
        cardNames: ['Visa'],
        defaultDueDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      })

      await pickVisa()

      expect(screen.getByLabelText('Fecha')).toHaveValue(
        `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
      )
    })

    it('requires a price for a card purchase', async () => {
      await renderForm({ cardNames: ['Visa'] })

      fillCommon({ name: 'Tele', category: 'Otros' })
      await pickVisa()
      fireEvent.click(screen.getByRole('button', { name: 'Agregar compra' }))

      expect(await screen.findByText('Ingresá un monto')).toBeInTheDocument()
    })
  })
})

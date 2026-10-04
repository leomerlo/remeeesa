import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  currentMonthRange,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { createCard } from '@/lib/cards'
import type { PaymentMethodKind } from '@/lib/cards'
import type { CardCurrency } from '@/lib/money'
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
    // A plain name is a peso credit card; pass a pair for another
    // currency, or a `methods` entry for anything that is not credit.
    readonly cardNames?: readonly (string | readonly [string, CardCurrency])[]
    readonly methods?: readonly {
      readonly name: string
      readonly kind: PaymentMethodKind
      readonly currency: CardCurrency
    }[]
  } = {},
) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  for (const entry of options.cardNames ?? []) {
    const [name, currency] =
      typeof entry === 'string' ? ([entry, 'ARS'] as const) : entry
    await createCard({ db, householdId: household.id, name, currency })
  }
  for (const method of options.methods ?? []) {
    await createCard({
      db,
      householdId: household.id,
      name: method.name,
      kind: method.kind,
      currency: method.currency,
    })
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

    // Paid immediately, so nothing is left pending -- next month's copy is
    // carried over by hand ("Pasar recurrentes"), not spawned by paying.
    expect(await listPendientes({ db, householdId })).toEqual([])
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

  // Dollars are recorded but never counted; the form says so where the
  // amount is typed, so the figure is never a surprise later.
  // Efectivo is pesos, so a dollar gasto is logged against a method that is
  // itself in dollars -- a dollar debit card, or the cash you take on a
  // trip, added once in Ajustes. Per direct feedback.
  it('records a gasto in dollars and warns it will not touch the budget', async () => {
    const { db, householdId } = await renderForm({
      methods: [{ name: 'Efectivo USD', kind: 'efectivo', currency: 'USD' }],
    })

    fillCommon({ name: 'Hosting', category: 'Servicios' })
    const paidWith = screen.getByLabelText('Método de pago')
    const efectivoUsd = within(paidWith)
      .getAllByRole('option')
      .find((option) => option.textContent === 'Efectivo USD')
    fireEvent.change(paidWith, {
      target: { value: efectivoUsd?.getAttribute('value') },
    })
    expect(
      screen.getByText(
        'Los gastos en dólares se registran pero no se descuentan del presupuesto del mes.',
      ),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '20' },
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
      expect.objectContaining({ name: 'Hosting', price: 20, currency: 'USD' }),
    ])
  })

  it('records a gasto in pesos without saying anything about currency', async () => {
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
      expect.objectContaining({ name: 'Café', currency: 'ARS' }),
    ])
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

  describe('Método de pago', () => {
    it('defaults to efectivo and offers a shortcut to Ajustes when there are no others', async () => {
      await renderForm()

      const paidWith = screen.getByLabelText('Método de pago')
      expect(paidWith).toHaveValue('')
      expect(
        within(paidWith)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Efectivo'])
      expect(
        await screen.findByRole('link', {
          name: 'Agregar un método de pago en Ajustes',
        }),
      ).toHaveAttribute('href', '/household')
      expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument()
    })

    it('lists the household cards and asks for cuotas, defaulting to 1, once one is picked', async () => {
      await renderForm({ cardNames: ['Visa', 'Amex'] })

      const paidWith = screen.getByLabelText('Método de pago')
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
      // The toggles stay: they are about the gasto, not about the card. A
      // household pays a recurring bill with a credit card as readily as
      // with cash. Per direct feedback. On a card "Ya lo pagué" reads as
      // "Ya lo compré", because that is what happened.
      expect(screen.getByLabelText('Ya lo compré')).toBeInTheDocument()
      expect(screen.getByLabelText('Recurrente')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Agregar compra' }),
      ).toBeInTheDocument()
    })

    async function pickVisa(): Promise<void> {
      const paidWith = screen.getByLabelText('Método de pago')
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
      // The estimate, not a debt: the cuotas are what the household has
      // logged, and the bill is whatever the card says when the statement
      // closes.
      expect(resumenes.map((r) => [r.name, r.estimatedAmount])).toEqual([
        ['Visa', 33.33],
        ['Visa', 33.33],
        ['Visa', 33.34],
      ])
    })

    // The whole point of the kinds: credit is the only one that does not
    // touch this month. Debit, a Mercado Pago balance and cash are money
    // that has already gone, so each makes an ordinary gasto of the month
    // it was made in -- with the method recorded on it. Per direct
    // feedback.
    it('logs a debit gasto as this month, with the method on it', async () => {
      const { db, householdId } = await renderForm({
        methods: [{ name: 'Mercury', kind: 'debito', currency: 'USD' }],
      })

      fillCommon({ name: 'Cena', category: 'Comida' })
      const paidWith = screen.getByLabelText('Método de pago')
      const mercury = within(paidWith)
        .getAllByRole('option')
        .find((option) => option.textContent === 'Mercury')
      fireEvent.change(paidWith, {
        target: { value: mercury?.getAttribute('value') },
      })
      // No cuotas: nothing is being financed.
      expect(screen.queryByLabelText('Cuotas')).not.toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Precio'), {
        target: { value: '40' },
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
        expect.objectContaining({
          name: 'Cena',
          price: 40,
          // The method's own currency, with no choice to make: that is why
          // the method is picked before the amount.
          currency: 'USD',
          paymentMethodId: mercury?.getAttribute('value'),
        }),
      ])
      // And nothing booked for a later month.
      expect(await listPendientes({ db, householdId })).toEqual([])
    })

    it('leaves the method off a gasto paid in cash', async () => {
      const { db, householdId } = await renderForm()

      fillCommon({ name: 'Feria', category: 'Comida' })
      fireEvent.change(screen.getByLabelText('Precio'), {
        target: { value: '15' },
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
        expect.objectContaining({ name: 'Feria', paymentMethodId: null }),
      ])
    })

    it('rejects cuotas outside 1–24 and writes nothing', async () => {
      const { db, householdId } = await renderForm({ cardNames: ['Visa'] })

      fillCommon({ name: 'Tele', category: 'Electro' })
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
      const categoryNames = (await listCategories({ db, householdId })).map(
        (c) => c.name,
      )
      expect(categoryNames).not.toContain('Electro')
    })

    it('rejects less than one cent per cuota before creating any category', async () => {
      const { db, householdId } = await renderForm({ cardNames: ['Visa'] })

      fillCommon({ name: 'Chicle', category: 'Kiosco' })
      fireEvent.change(screen.getByLabelText('Precio'), {
        target: { value: '0,05' },
      })
      await pickVisa()
      fireEvent.change(screen.getByLabelText('Cuotas'), {
        target: { value: '12' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Agregar compra' }))

      expect(
        await screen.findByText(
          'El precio tiene que ser de al menos $0,01 por cuota',
        ),
      ).toBeInTheDocument()
      const categoryNames = (await listCategories({ db, householdId })).map(
        (c) => c.name,
      )
      expect(categoryNames).not.toContain('Kiosco')
    })

    it('says so when the cards cannot be loaded, instead of looking like there are none', async () => {
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
      })
      renderWithProviders(
        <MemoryRouter>
          <AddGastoSheetHarness
            db={{ ...db, listCards: () => Promise.reject(new Error('boom')) }}
            householdId={household.id}
            memberId="user-1"
            authorDisplayName="Ada"
          />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'Agregar gasto' }))

      expect(
        await screen.findByText('No se pudieron cargar las tarjetas.'),
      ).toBeInTheDocument()
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

// A card the bank bills in both currencies does not decide for you: the
// peso consumo and the dollar one go on the same card, and each lands in
// that card's Resumen of its own currency.
describe('AddGastoSheet on a card that holds both currencies', () => {
  async function pickCard(name: string): Promise<void> {
    const paidWith = screen.getByLabelText('Método de pago')
    await within(paidWith).findByRole('option', { name })
    fireEvent.change(paidWith, {
      target: {
        value: within(paidWith)
          .getByRole('option', { name })
          .getAttribute('value'),
      },
    })
  }

  it('leaves the currency open to choose', async () => {
    await renderForm({ cardNames: [['Amex', 'BOTH']] })

    await pickCard('Amex')

    const currency = screen.getByLabelText('Moneda')
    expect(
      [...currency.querySelectorAll('option')].map((option) => option.value),
    ).toEqual(['ARS', 'USD'])
  })

  it('fixes the currency on a card that holds only one', async () => {
    await renderForm({ cardNames: [['Mercury', 'USD']] })

    await pickCard('Mercury')

    expect(screen.queryByLabelText('Moneda')).not.toBeInTheDocument()
    expect(screen.getByText('US$')).toBeInTheDocument()
  })

  it('records a dollar consumo and warns it stays out of the budget', async () => {
    const { db, householdId } = await renderForm({
      cardNames: [['Amex', 'BOTH']],
    })

    fillCommon({ name: 'Hosting', category: 'Servicios' })
    fireEvent.change(screen.getByLabelText('Precio'), {
      target: { value: '50' },
    })
    await pickCard('Amex')
    fireEvent.change(screen.getByLabelText('Moneda'), {
      target: { value: 'USD' },
    })
    expect(
      screen.getByText(
        'Los gastos en dólares se registran pero no se descuentan del presupuesto del mes.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Agregar compra' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    // Its own Resumen, named apart from the card's peso one and marked as
    // the dollar bill it is.
    const resumenes = await listPendientes({ db, householdId })
    expect(
      resumenes.map((resumen) => [resumen.name, resumen.currency]),
    ).toEqual([['Amex US$', 'USD']])
  })
})

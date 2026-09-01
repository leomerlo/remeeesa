import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createCuenta,
  CuentaAlreadyPaidError,
  CuentaNotFoundError,
  listPendingCuentas,
} from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MarkCuentaPaidForm } from './MarkCuentaPaidForm'

function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function seedHouseholdWithCuenta(
  expectedAmount: number | null,
): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuenta: Cuenta
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const comida = categories.find((category) => category.name === 'Comida')
  if (comida === undefined) {
    throw new Error('expected seeded Comida category')
  }
  const cuenta = await createCuenta({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount,
  })
  return { db, householdId: household.id, cuenta }
}

function renderForm(
  input: {
    readonly db: HouseholdsDb
    readonly householdId: string
    readonly cuenta: Cuenta
    readonly onDone?: () => void
    readonly queryClient?: QueryClient
  },
  overrides: {
    readonly db?: HouseholdsDb
  } = {},
) {
  const onDone = input.onDone ?? vi.fn()
  renderWithProviders(
    <MarkCuentaPaidForm
      db={overrides.db ?? input.db}
      householdId={input.householdId}
      memberId="user-1"
      authorDisplayName="Flor"
      cuenta={input.cuenta}
      onDone={onDone}
    />,
    { queryClient: input.queryClient },
  )
  return { onDone }
}

describe('MarkCuentaPaidForm', () => {
  it('pre-fills the amount from the cuenta expected amount, editable', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)

    renderForm({ db, householdId, cuenta })

    const amountInput = await screen.findByLabelText('Monto pagado')
    expect(amountInput).toHaveValue('500')

    fireEvent.change(amountInput, { target: { value: '450' } })
    expect(amountInput).toHaveValue('450')
  })

  it('leaves the amount blank and required when the cuenta has no expected amount', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(null)

    renderForm({ db, householdId, cuenta })

    const amountInput = await screen.findByLabelText('Monto pagado')
    expect(amountInput).toHaveValue('')

    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(1)
  })

  it('defaults the payment date to today, with max set to today', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)

    renderForm({ db, householdId, cuenta })

    const dateInput = await screen.findByLabelText('Fecha de pago')
    const today = localDateInputValue(new Date())
    expect(dateInput).toHaveValue(today)
    expect(dateInput).toHaveAttribute('max', today)
  })

  it('rejects a future-dated payment', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)

    renderForm({ db, householdId, cuenta })

    const dateInput = await screen.findByLabelText('Fecha de pago')
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    fireEvent.change(dateInput, {
      target: { value: localDateInputValue(tomorrow) },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha de pago no puede ser futura',
    )
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(1)
  })

  it('rejects an empty payment date', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)

    renderForm({ db, householdId, cuenta })

    const dateInput = await screen.findByLabelText('Fecha de pago')
    fireEvent.change(dateInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La fecha de pago no es válida',
    )
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(1)
  })

  it('rejects a negative, zero, or non-numeric amount with cuenta-domain wording (not expense wording)', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)

    renderForm({ db, householdId, cuenta })

    const amountInput = await screen.findByLabelText('Monto pagado')

    fireEvent.change(amountInput, { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El monto pagado debe ser un número positivo',
    )

    fireEvent.change(amountInput, { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El monto pagado debe ser un número positivo',
    )

    fireEvent.change(amountInput, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El monto pagado debe ser un número positivo',
    )

    expect(await listPendingCuentas({ db, householdId })).toHaveLength(1)
  })

  it('clears the alert and succeeds after fixing an invalid amount and resubmitting', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const onDone = vi.fn()

    renderForm({ db, householdId, cuenta, onDone })

    const amountInput = await screen.findByLabelText('Monto pagado')
    fireEvent.change(amountInput, { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.change(amountInput, { target: { value: '480' } })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(0)
  })

  it('ignores a second submit click once the button has disabled from the first, calling markCuentaPaid only once', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const gate = deferred<void>()
    const realMarkCuentaPaid = db.markCuentaPaid.bind(
      db,
    ) as HouseholdsDb['markCuentaPaid']
    const markCuentaPaidSpy = vi.fn(
      async (args: Parameters<HouseholdsDb['markCuentaPaid']>[0]) => {
        await gate.promise
        return realMarkCuentaPaid(args)
      },
    )
    const scopedDb: HouseholdsDb = { ...db, markCuentaPaid: markCuentaPaidSpy }

    renderForm({ db, householdId, cuenta }, { db: scopedDb })

    const submitButton = await screen.findByRole('button', {
      name: 'Marcar pagada',
    })
    fireEvent.click(submitButton)

    // Same guard the sheet-level test relies on for the dismiss case: the
    // pending flag only reaches the button's disabled attribute one tick
    // after mutate() starts, so wait for it to actually land before the
    // second click -- otherwise the click fires the disabled DOM button,
    // which a real browser (and jsdom) already refuses to dispatch to.
    await waitFor(() => {
      expect(submitButton).toBeDisabled()
    })
    fireEvent.click(submitButton)
    expect(markCuentaPaidSpy).toHaveBeenCalledTimes(1)

    gate.resolve()

    await waitFor(async () => {
      expect(await listPendingCuentas({ db, householdId })).toHaveLength(0)
    })
    expect(markCuentaPaidSpy).toHaveBeenCalledTimes(1)
  })

  it('calls markCuentaPaid with the correct args, invalidates the cuentas query, and calls onDone on success', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const markCuentaPaidSpy = vi.fn(
      db.markCuentaPaid.bind(db) as HouseholdsDb['markCuentaPaid'],
    )
    const spiedDb: HouseholdsDb = { ...db, markCuentaPaid: markCuentaPaidSpy }

    const { onDone } = renderForm(
      { db, householdId, cuenta, queryClient },
      { db: spiedDb },
    )

    const amountInput = await screen.findByLabelText('Monto pagado')
    fireEvent.change(amountInput, { target: { value: '480' } })
    fireEvent.change(screen.getByLabelText('Fecha de pago'), {
      // A fixed, definitively-past date -- unlike "today", this can't ever
      // become invalid against the date input's max-today cap depending on
      // what day the suite happens to run.
      target: { value: '2024-01-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    await waitFor(() => {
      expect(onDone).toHaveBeenCalledTimes(1)
    })

    expect(markCuentaPaidSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        householdId,
        cuentaId: cuenta.id,
        memberId: 'user-1',
        authorDisplayName: 'Flor',
        finalAmount: 480,
        paymentDate: new Date(2024, 0, 1),
      }),
    )

    const listed = await db.getCuenta({ householdId, cuentaId: cuenta.id })
    expect(listed).toEqual(
      expect.objectContaining({
        status: 'paid',
        paidExpenseId: expect.any(String),
      }),
    )
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(0)
  })

  it('shows a clear message and keeps the sheet open when the cuenta was already paid', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const onDone = vi.fn()
    const scopedDb: HouseholdsDb = {
      ...db,
      markCuentaPaid: async () => {
        throw new CuentaAlreadyPaidError()
      },
    }

    renderForm({ db, householdId, cuenta, onDone }, { db: scopedDb })

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta ya fue pagada',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  it('translates an expense-domain validation message from the mutation into cuenta-domain wording, in case it ever reaches the async path directly', async () => {
    // parseMarkCuentaPaidFields already validates client-side before mutate()
    // is even called, so this simulates the mutation's own internal
    // parseExpensePrice/parseExpenseDate call throwing directly -- a defense-
    // in-depth path that should never leak "gasto" wording either.
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const onDone = vi.fn()
    const scopedDb: HouseholdsDb = {
      ...db,
      markCuentaPaid: async () => {
        throw new Error('El precio del gasto debe ser un número positivo')
      },
    }

    renderForm({ db, householdId, cuenta, onDone }, { db: scopedDb })

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El monto pagado debe ser un número positivo',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  it('shows a clear message and keeps the sheet open when the cuenta no longer exists', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const onDone = vi.fn()
    const scopedDb: HouseholdsDb = {
      ...db,
      markCuentaPaid: async () => {
        throw new CuentaNotFoundError()
      },
    }

    renderForm({ db, householdId, cuenta, onDone }, { db: scopedDb })

    fireEvent.click(await screen.findByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta ya no existe',
    )
    expect(onDone).not.toHaveBeenCalled()
  })

  it('closes without side effects when Cancelar is clicked', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta(500)
    const onDone = vi.fn()

    renderForm({ db, householdId, cuenta, onDone })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

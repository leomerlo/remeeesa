import { QueryClient, useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { listPendingCuentas } from '@/lib/cuentas'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { AddCuentaSheetProps } from './AddCuentaSheet'
import { cuentasQueryKey } from './queryKeys'

function PendingCuentasCount(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const query = useQuery({
    queryKey: cuentasQueryKey({ householdId: props.householdId }),
    queryFn: () =>
      listPendingCuentas({ db: props.db, householdId: props.householdId }),
  })
  if (query.data === undefined) {
    return <p>Loading cuentas</p>
  }
  return <p>{`Pending cuentas: ${String(query.data.length)}`}</p>
}

function AddCuentaSheetHarness(
  props: Omit<AddCuentaSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddCuentaSheet open={open} onOpenChange={setOpen} {...props} />
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

describe('AddCuentaSheet', () => {
  it('renders only the trigger button when closed', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddCuentaSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Nueva cuenta' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
  })

  it('opens the sheet with the form when the trigger is clicked', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddCuentaSheetHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Nueva cuenta' }),
    ).not.toBeInTheDocument()
  })

  it('closes the sheet and invalidates the cuentas query after a successful add', async () => {
    const { db, householdId } = await seedHousehold()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <>
        <AddCuentaSheetHarness db={db} householdId={householdId} />
        <PendingCuentasCount db={db} householdId={householdId} />
      </>,
      { queryClient },
    )

    expect(await screen.findByText('Pending cuentas: 0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Servicios' },
    })
    fireEvent.change(screen.getByLabelText('Fecha de vencimiento'), {
      target: { value: '2026-09-10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Nueva cuenta' }),
    ).toBeInTheDocument()
    // A sibling consumer of the same query key sees the new cuenta once the
    // sheet's mutation invalidates it -- proving invalidation actually
    // happened, not just that the sheet closed.
    await waitFor(() => {
      expect(screen.getByText('Pending cuentas: 1')).toBeInTheDocument()
    })
  })

  it('restores focus to the trigger button after the sheet closes', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddCuentaSheetHarness db={db} householdId={householdId} />,
    )

    const trigger = screen.getByRole('button', { name: 'Nueva cuenta' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    await screen.findByLabelText('Nombre')
    expect(trigger).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Nueva cuenta' })).toHaveFocus()
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
      createCuenta: async () => create.promise,
    }

    renderWithProviders(
      <AddCuentaSheetHarness db={db} householdId={household.id} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Servicios' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }))

    // The mutation is still pending: an Escape dismiss attempt must be a
    // no-op rather than unmounting the form out from under it.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument()

    create.reject(new Error('Network blip'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network blip')
    // Still open and showing the failed draft -- nothing was silently lost.
    expect(screen.getByLabelText('Nombre')).toHaveValue('Alquiler')

    // Once the mutation has settled, the dismiss guard must release: a
    // second Escape now closes the sheet as normal.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
  })
})

import { QueryClient, useQuery } from '@tanstack/react-query'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createPendiente, listPendientes } from '@/lib/pendientes'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { EditPendienteTarget } from './AddPendienteForm'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { AddPendienteSheetProps } from './AddPendienteSheet'
import { pendientesQueryKey } from './queryKeys'

function PendingPendientesCount(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const query = useQuery({
    queryKey: pendientesQueryKey({ householdId: props.householdId }),
    queryFn: () =>
      listPendientes({ db: props.db, householdId: props.householdId }),
  })
  if (query.data === undefined) {
    return <p>Loading pendientes</p>
  }
  return <p>{`Pending pendientes: ${String(query.data.length)}`}</p>
}

function AddPendienteSheetHarness(
  props: Omit<AddPendienteSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddPendienteSheet open={open} onOpenChange={setOpen} {...props} />
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

describe('AddPendienteSheet', () => {
  it('renders only the trigger button when closed', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddPendienteSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Nuevo recurrente' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
  })

  it('opens the sheet with the form when the trigger is clicked', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo recurrente' }))

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Nuevo recurrente' }),
    ).not.toBeInTheDocument()
  })

  it('closes the sheet and invalidates the pendientes query after a successful add', async () => {
    const { db, householdId } = await seedHousehold()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderWithProviders(
      <>
        <AddPendienteSheetHarness
          db={db}
          householdId={householdId}
          memberId="user-1"
          authorDisplayName="Ada"
        />
        <PendingPendientesCount db={db} householdId={householdId} />
      </>,
      { queryClient },
    )

    expect(await screen.findByText('Pending pendientes: 0')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo recurrente' }))
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Servicios' },
    })
    fireEvent.change(screen.getByLabelText('Fecha de vencimiento'), {
      target: { value: '2026-09-10' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar recurrente' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Nuevo recurrente' }),
    ).toBeInTheDocument()
    // A sibling consumer of the same query key sees the new pendiente once the
    // sheet's mutation invalidates it -- proving invalidation actually
    // happened, not just that the sheet closed.
    await waitFor(() => {
      expect(screen.getByText('Pending pendientes: 1')).toBeInTheDocument()
    })
  })

  it('restores focus to the trigger button after the sheet closes', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Nuevo recurrente' })
    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    await screen.findByLabelText('Nombre')
    expect(trigger).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('button', { name: 'Nuevo recurrente' }),
    ).toHaveFocus()
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
      createPendiente: async () => create.promise,
    }

    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo recurrente' }))
    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Alquiler' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: 'Servicios' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar recurrente' }))

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

  it('opens editing through the same sheet used for adding, even if open is false', async () => {
    const { db, householdId } = await seedHousehold()
    const editPendiente: EditPendienteTarget = {
      pendienteId: 'pendiente-1',
      name: 'Alquiler',
      categoryName: 'Servicios',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
      recurring: false,
    }

    renderWithProviders(
      <AddPendienteSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editPendiente={editPendiente}
        onEditFinished={() => {}}
      />,
    )

    // The edit form is visible immediately -- no trigger click needed --
    // inside the same Sheet chrome the add flow uses, titled for editing.
    expect(await screen.findByLabelText('Nombre')).toHaveValue('Alquiler')
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
    const sheetContent = document.querySelector('[data-slot="sheet-content"]')
    expect(sheetContent).not.toBeNull()
    expect(sheetContent).toHaveTextContent('Editar pendiente')

    // No "Nuevo recurrente" trigger while the sheet is open editing: the two
    // flows never coexist on screen, so there's no name collision.
    expect(
      screen.queryByRole('button', { name: 'Nuevo recurrente' }),
    ).not.toBeInTheDocument()
  })

  it('calls onEditFinished after a successful save routed through the sheet component', async () => {
    const { db, householdId } = await seedHousehold()
    const categories = await listCategories({ db, householdId })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })
    const onEditFinished = vi.fn()
    const editPendiente: EditPendienteTarget = {
      pendienteId: pendiente.id,
      name: 'Alquiler',
      categoryName: 'Comida',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
      recurring: false,
    }

    renderWithProviders(
      <AddPendienteSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editPendiente={editPendiente}
        onEditFinished={onEditFinished}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Nombre'), {
      target: { value: 'Alquiler nuevo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
    const listed = await listPendientes({ db, householdId })
    expect(listed).toEqual([
      expect.objectContaining({ name: 'Alquiler nuevo' }),
    ])
  })

  it('calls onEditFinished when the edit sheet is dismissed without saving', async () => {
    const { db, householdId } = await seedHousehold()
    const onEditFinished = vi.fn()
    const editPendiente: EditPendienteTarget = {
      pendienteId: 'pendiente-1',
      name: 'Alquiler',
      categoryName: 'Servicios',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
      recurring: false,
    }

    renderWithProviders(
      <AddPendienteSheet
        open={false}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editPendiente={editPendiente}
        onEditFinished={onEditFinished}
      />,
    )

    await screen.findByLabelText('Nombre')
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(onEditFinished).toHaveBeenCalledTimes(1)
    })
  })
})

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  currentMonthRange,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  FirestoreDeniedError,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  createPendiente,
  deletePendiente,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddPendienteForm } from './AddPendienteForm'
import type { EditPendienteTarget } from './AddPendienteForm'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { AddPendienteSheetProps } from './AddPendienteSheet'
import { PendientesList } from './PendientesList'

function AddPendienteSheetHarness(
  props: Omit<AddPendienteSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddPendienteSheet open={open} onOpenChange={setOpen} {...props} />
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
    <AddPendienteSheetHarness
      db={db}
      householdId={household.id}
      memberId="user-1"
      authorDisplayName="Ada"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Agregar Servicio' }))
  await screen.findByLabelText('Nombre')
  return { db, householdId: household.id }
}

function fillPendiente(fields: {
  readonly name?: string
  readonly category?: string
  readonly dueDate?: string
  readonly expectedAmount?: string
}): void {
  if (fields.name !== undefined) {
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: fields.name },
    })
  }
  if (fields.category !== undefined) {
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), {
      target: { value: fields.category },
    })
  }
  if (fields.dueDate !== undefined) {
    fireEvent.change(screen.getByLabelText('Fecha de vencimiento'), {
      target: { value: fields.dueDate },
    })
  }
  if (fields.expectedAmount !== undefined) {
    fireEvent.change(screen.getByLabelText('Monto esperado'), {
      target: { value: fields.expectedAmount },
    })
  }
}

function submitPendiente(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar recurrente' }))
}

describe('AddPendienteForm', () => {
  it('stores a pending pendiente for the household', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
      expectedAmount: '500',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({
          householdId,
          name: 'Alquiler',
          expectedAmount: 500,
          recurring: false,
          status: 'pending',
        }),
      ])
    })

    // A successful save closes the sheet: the form unmounts and the
    // trigger button reappears.
    await waitFor(() => {
      expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Agregar Servicio' }),
      ).toBeInTheDocument()
    })
  })

  it('rejects an empty name', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({ name: '', category: 'Comida', dueDate: '2026-09-10' })
    submitPendiente()

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('rejects a whitespace-only name', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({ name: '   ', category: 'Comida', dueDate: '2026-09-10' })
    submitPendiente()

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('rejects an empty category', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({ name: 'Alquiler', category: '   ', dueDate: '2026-09-10' })
    submitPendiente()

    expect(screen.getByRole('alert')).toHaveTextContent(/categoría/i)
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('rejects an empty due date', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({ name: 'Alquiler', category: 'Comida', dueDate: '' })
    submitPendiente()

    expect(screen.getByRole('alert')).toHaveTextContent(/fecha/i)
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('accepts a due date in the past with no validation error, unlike the expense form', async () => {
    const { db, householdId } = await renderForm()

    expect(screen.getByLabelText('Fecha de vencimiento')).not.toHaveAttribute(
      'max',
    )
    expect(screen.getByLabelText('Fecha de vencimiento')).not.toHaveAttribute(
      'min',
    )

    fillPendiente({
      name: 'Vieja deuda',
      category: 'Comida',
      dueDate: '2020-01-01',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({
          name: 'Vieja deuda',
          dueDate: new Date(2020, 0, 1),
        }),
      ])
    })
  })

  it('leaves expectedAmount as null, not 0, when the field is left blank', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Luz',
      category: 'Servicios',
      dueDate: '2026-09-05',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({ name: 'Luz', expectedAmount: null }),
      ])
    })
  })

  it('rejects a negative, zero, or non-numeric expected amount when one is provided', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Alquiler',
      category: 'Comida',
      dueDate: '2026-09-10',
      expectedAmount: '-1',
    })
    submitPendiente()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    fillPendiente({ expectedAmount: '0' })
    submitPendiente()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    // A lone "," (decimal separator, no digits either side) is the only
    // realistic "malformed" value FormattedAmountInput can still produce --
    // it filters out actual letters keystroke by keystroke, so plain text
    // like "abc" can no longer land in the field at all.
    fillPendiente({ expectedAmount: ',' })
    submitPendiente()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('offers "Ya lo pagué" while adding a new pendiente too, not just while editing', async () => {
    await renderForm()

    expect(screen.getByLabelText('Ya lo pagué')).toBeInTheDocument()
    // Collapsed until checked, same as the edit form.
    expect(screen.queryByLabelText('Fecha de pago')).not.toBeInTheDocument()
  })

  it('creates the pendiente already marked paid in one submit when "Ya lo pagué" is checked', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Gimnasio',
      category: 'Salud',
      dueDate: '2026-09-12',
      expectedAmount: '8000',
    })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Agregar y marcar pagado' }),
    )

    // Paid immediately, so it never shows up as pending.
    await waitFor(() => {
      expect(listPendientes({ db, householdId })).resolves.toEqual([])
    })

    // A real Expense was created for it.
    const expenses = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(expenses).toEqual([
      expect.objectContaining({ name: 'Gimnasio', price: 8000 }),
    ])
  })

  it('requires an amount to mark a new pendiente paid on creation', async () => {
    await renderForm()

    fillPendiente({
      name: 'Gimnasio',
      category: 'Salud',
      dueDate: '2026-09-12',
    })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Agregar y marcar pagado' }),
    )

    expect(
      await screen.findByText('Ingresá un monto para marcarlo como pagado'),
    ).toBeInTheDocument()
  })

  it('creates a new category from free text, reusing the same pick-or-create behavior as the Expense form', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Streaming',
      category: 'Suscripciones',
      dueDate: '2026-09-12',
      expectedAmount: '15',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toHaveLength(1)
      const categories = await listCategories({ db, householdId })
      const created = categories.find(
        (category) => category.name === 'Suscripciones',
      )
      expect(created).toBeDefined()
      expect(listed[0]?.categoryId).toBe(created?.id)
    })
  })

  it('reuses an existing category instead of creating a duplicate', async () => {
    const { db, householdId } = await renderForm()
    const categoriesBefore = await listCategories({ db, householdId })
    const comida = categoriesBefore.find(
      (category) => category.name === 'Comida',
    )
    expect(comida).toBeDefined()

    fillPendiente({
      name: 'Supermercado',
      category: '  comida  ',
      dueDate: '2026-09-05',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({ categoryId: comida?.id }),
      ])
    })
    const categoriesAfter = await listCategories({ db, householdId })
    expect(
      categoriesAfter.filter(
        (category) => category.name.toLowerCase() === 'comida',
      ),
    ).toHaveLength(1)
  })

  it('defaults the recurring toggle to unchecked and stores recurring: false when left untouched', async () => {
    const { db, householdId } = await renderForm()

    expect(screen.getByLabelText('Recurrente')).toHaveAttribute(
      'data-state',
      'unchecked',
    )

    fillPendiente({
      name: 'Internet',
      category: 'Servicios',
      dueDate: '2026-09-08',
      expectedAmount: '30',
    })
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({
          name: 'Internet',
          recurring: false,
          expectedAmount: 30,
        }),
      ])
    })
  })

  it('passes recurring: true when the toggle is switched on, without affecting expectedAmount', async () => {
    const { db, householdId } = await renderForm()

    fillPendiente({
      name: 'Gimnasio',
      category: 'Servicios',
      dueDate: '2026-09-15',
      expectedAmount: '25',
    })
    fireEvent.click(screen.getByLabelText('Recurrente'))
    expect(screen.getByLabelText('Recurrente')).toHaveAttribute(
      'data-state',
      'checked',
    )
    submitPendiente()

    await waitFor(async () => {
      const listed = await listPendientes({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({
          name: 'Gimnasio',
          recurring: true,
          expectedAmount: 25,
        }),
      ])
    })
  })

  it('shows which Firestore operation was denied when saving the category', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      findOrCreateCategory: async () => {
        throw new FirestoreDeniedError({
          operation: 'findOrCreateCategory',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Servicio' }))
    await screen.findByLabelText('Nombre')

    fillPendiente({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
    })
    submitPendiente()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar la categoría. Volvé a intentar.',
    )
  })

  it('shows which Firestore operation was denied when adding the pendiente', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      createPendiente: async () => {
        throw new FirestoreDeniedError({
          operation: 'createPendiente',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Servicio' }))
    await screen.findByLabelText('Nombre')

    fillPendiente({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
    })
    submitPendiente()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo agregar el pendiente. Volvé a intentar.',
    )
  })

  it('shows which Firestore operation failed when categories cannot load', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      listCategories: async () => {
        throw new FirestoreDeniedError({
          operation: 'listCategories',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }

    renderWithProviders(
      <AddPendienteSheetHarness
        db={db}
        householdId={household.id}
        memberId="user-1"
        authorDisplayName="Ada"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Agregar Servicio' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar las categorías. Volvé a intentar.',
    )
  })
})

function EditPendienteHarness(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(null)

  return (
    <>
      <AddPendienteForm
        db={props.db}
        householdId={props.householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editPendiente={editPendiente}
        onEditFinished={() => {
          setEditPendiente(null)
        }}
      />
      <PendientesList
        db={props.db}
        householdId={props.householdId}
        onEditPendiente={(pendiente, categoryName) => {
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
          })
        }}
      />
    </>
  )
}

async function seedPendingPendiente(input?: {
  readonly name?: string
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
}): Promise<{
  readonly store: ReturnType<typeof createMemoryHouseholdsDb>
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendiente: Pendiente
}> {
  const store = createMemoryHouseholdsDb()
  const db = store.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
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
    name: input?.name ?? 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount:
      input?.expectedAmount !== undefined ? input.expectedAmount : 500,
    recurring: input?.recurring ?? false,
  })
  return { store, db, householdId: household.id, pendiente }
}

describe('EditPendienteFlow', () => {
  it('opens a pre-filled form when a list row is tapped, including recurring', async () => {
    const { db, householdId } = await seedPendingPendiente({
      name: 'Alquiler',
      expectedAmount: 500,
      recurring: true,
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )

    expect(screen.getByLabelText('Nombre')).toHaveValue('Alquiler')
    expect(screen.getByLabelText('Categoría')).toHaveValue('Comida')
    expect(screen.getByLabelText('Fecha de vencimiento')).toHaveValue(
      '2026-09-10',
    )
    expect(screen.getByLabelText('Monto esperado')).toHaveValue('500')
    expect(screen.getByLabelText('Recurrente')).toHaveAttribute(
      'data-state',
      'checked',
    )
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })

  it('pre-fills a blank expected amount and unchecked recurring when the stored pendiente has them', async () => {
    const { db, householdId } = await seedPendingPendiente({
      name: 'Luz',
      expectedAmount: null,
      recurring: false,
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))

    expect(screen.getByLabelText('Monto esperado')).toHaveValue('')
    expect(screen.getByLabelText('Recurrente')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
  })

  it('saves edited fields, including toggling recurring on, and refetches the list', async () => {
    const { db, householdId } = await seedPendingPendiente({
      name: 'Alquiler',
      expectedAmount: 500,
      recurring: false,
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Alquiler nuevo' },
    })
    fireEvent.change(screen.getByLabelText('Monto esperado'), {
      target: { value: '600' },
    })
    fireEvent.click(screen.getByLabelText('Recurrente'))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(screen.getByText('Alquiler nuevo')).toBeInTheDocument()
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()

    const listed = await listPendientes({ db, householdId })
    expect(listed).toEqual([
      expect.objectContaining({
        name: 'Alquiler nuevo',
        expectedAmount: 600,
        recurring: true,
      }),
    ])
  })

  it('deletes the pendiente from within the edit form after confirming, and refetches the list', async () => {
    const { db, householdId } = await seedPendingPendiente({ name: 'Alquiler' })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pendiente' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('¿Eliminar el pendiente?')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar pendiente' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('No hay servicios en este mes'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()
    expect(await listPendientes({ db, householdId })).toEqual([])
  })

  it('cancels the delete confirmation and keeps the pendiente', async () => {
    const { db, householdId } = await seedPendingPendiente({ name: 'Alquiler' })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pendiente' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancelar',
      }),
    )

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Alquiler')).toBeInTheDocument()
    expect(await listPendientes({ db, householdId })).toHaveLength(1)
  })

  it('discards edits and leaves the pendiente unchanged via "Cancelar edición"', async () => {
    const { db, householdId } = await seedPendingPendiente({ name: 'Alquiler' })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Cambio descartado' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }))

    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Alquiler')).toBeInTheDocument()
    const listed = await listPendientes({ db, householdId })
    expect(listed).toEqual([expect.objectContaining({ name: 'Alquiler' })])
  })

  it('closes the edit form with no alert when the pendiente was deleted elsewhere before saving', async () => {
    const { store, db, householdId, pendiente } = await seedPendingPendiente({
      name: 'Alquiler',
    })
    store.seedMembership({ userId: 'user-2', householdId })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    // Simulates a second household member deleting the same pendiente while
    // this member's edit form is still open.
    await deletePendiente({
      db: store.asUser('user-2'),
      householdId,
      pendienteId: pendiente.id,
    })
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Stale edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Unlike the Expense form's stale-edit case, a gone Pendiente closes
    // silently with no alert -- there is nothing left to save over or retry.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Guardar cambios' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await screen.findByText('No hay servicios en este mes'),
    ).toBeInTheDocument()
  })

  it('closes the edit form with no alert when the pendiente was marked paid elsewhere before saving', async () => {
    const { store, db, householdId, pendiente } = await seedPendingPendiente({
      name: 'Alquiler',
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    // Simulates the pendiente being marked paid (out of scope of this issue)
    // by someone else while this member's edit form is still open.
    store.seedPendiente({
      ...pendiente,
      status: 'paid',
      paidExpenseId: 'expense-1',
    })
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Stale edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Guardar cambios' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await screen.findByText('No hay servicios en este mes'),
    ).toBeInTheDocument()
  })

  it('closes the confirmation with no persistent error when deleting a pendiente already deleted elsewhere', async () => {
    const { store, db, householdId, pendiente } = await seedPendingPendiente({
      name: 'Alquiler',
    })
    store.seedMembership({ userId: 'user-2', householdId })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pendiente' }))
    await deletePendiente({
      db: store.asUser('user-2'),
      householdId,
      pendienteId: pendiente.id,
    })
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar pendiente',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await screen.findByText('No hay servicios en este mes'),
    ).toBeInTheDocument()
  })

  it('shows an alert and keeps the edit form open when deleting fails for another reason', async () => {
    const { db, householdId } = await seedPendingPendiente({ name: 'Alquiler' })
    const failingDb: HouseholdsDb = {
      ...db,
      deletePendiente: async () => {
        throw new FirestoreDeniedError({
          operation: 'deletePendiente',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }

    renderWithProviders(
      <EditPendienteHarness db={failingDb} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar pendiente' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar pendiente',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo eliminar el pendiente',
    )
    // The confirmation dialog closes, but the edit form itself stays open
    // so the failed delete can be retried.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })

  it('reveals a payment-date field and requires an amount once "Ya lo pagué" is checked', async () => {
    const { db, householdId } = await seedPendingPendiente({
      name: 'Luz',
      expectedAmount: null,
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))
    expect(screen.queryByLabelText('Fecha de pago')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    expect(screen.getByLabelText('Fecha de pago')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)
    expect(await listPendientes({ db, householdId })).toEqual([
      expect.objectContaining({ name: 'Luz', status: 'pending' }),
    ])
  })

  it('saves edited fields and marks the pendiente paid in one submit when "Ya lo pagué" is checked', async () => {
    const { db, householdId } = await seedPendingPendiente({
      name: 'Alquiler',
      expectedAmount: 500,
    })

    renderWithProviders(
      <EditPendienteHarness db={db} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Alquiler nuevo' },
    })
    fireEvent.change(screen.getByLabelText('Monto esperado'), {
      target: { value: '600' },
    })
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    // The edit (renamed, re-priced) is applied, and the row is now settled
    // rather than gone: this screen keeps what was paid this month.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /Marcar pagado/ }),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByText('Alquiler nuevo').closest('li')).toHaveTextContent(
      'Pagado',
    )
    expect(await listPendientes({ db, householdId })).toEqual([])

    // A real Expense was created from the edited (not stale) fields, for
    // the amount just entered.
    const expenses = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(expenses).toEqual([
      expect.objectContaining({ name: 'Alquiler nuevo', price: 600 }),
    ])
  })

  it('pre-checks "Ya lo pagué" when opened with defaultMarkPaid, e.g. from the "Pagar" button', async () => {
    const { db, householdId, pendiente } = await seedPendingPendiente({
      name: 'Alquiler',
      expectedAmount: 500,
    })
    const editPendiente: EditPendienteTarget = {
      pendienteId: pendiente.id,
      name: 'Alquiler',
      categoryName: 'Comida',
      dueDate: pendiente.dueDate,
      expectedAmount: 500,
      recurring: false,
      defaultMarkPaid: true,
    }

    renderWithProviders(
      <AddPendienteForm
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        editPendiente={editPendiente}
      />,
    )

    expect(await screen.findByLabelText('Ya lo pagué')).toHaveAttribute(
      'data-state',
      'checked',
    )
    expect(screen.getByLabelText('Fecha de pago')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    ).toBeInTheDocument()
  })
})

function EditPaidPendienteHarness(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly initialEditPendiente: EditPendienteTarget
}): ReactElement {
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(props.initialEditPendiente)

  return (
    <AddPendienteForm
      db={props.db}
      householdId={props.householdId}
      memberId="user-1"
      authorDisplayName="Ada"
      editPendiente={editPendiente}
      onEditFinished={() => {
        setEditPendiente(null)
      }}
    />
  )
}

async function seedPaidPendiente(input?: {
  readonly name?: string
  readonly expectedAmount?: number
  readonly recurring?: boolean
}): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendiente: Pendiente
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
    throw new Error('expected Comida category')
  }
  const now = new Date()
  const created = await createPendiente({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: input?.name ?? 'Gimnasio',
    dueDate: now,
    expectedAmount: input?.expectedAmount ?? 8000,
    recurring: input?.recurring ?? false,
  })
  const { pendiente } = await markPendientePaid({
    db,
    householdId: household.id,
    pendienteId: created.id,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    finalAmount: input?.expectedAmount ?? 8000,
    paymentDate: now,
  })
  return { db, householdId: household.id, pendiente }
}

// Per direct feedback: marking a Pendiente paid by mistake needed a way
// back. This form is that way back -- opened with EditPendienteTarget.isPaid,
// it freezes every field except "Ya lo pagué", and unchecking it undoes the
// payment instead of the normal add/edit path.
describe('EditPaidPendienteFlow', () => {
  it('freezes every field except "Ya lo pagué" for an already-paid pendiente', async () => {
    const { db, householdId, pendiente } = await seedPaidPendiente({
      name: 'Gimnasio',
      expectedAmount: 8000,
    })

    renderWithProviders(
      <EditPaidPendienteHarness
        db={db}
        householdId={householdId}
        initialEditPendiente={{
          pendienteId: pendiente.id,
          name: 'Gimnasio',
          categoryName: 'Comida',
          dueDate: pendiente.dueDate,
          expectedAmount: 8000,
          recurring: false,
          isPaid: true,
        }}
      />,
    )

    expect(await screen.findByLabelText('Nombre')).toBeDisabled()
    expect(screen.getByLabelText('Monto esperado')).toBeDisabled()
    expect(screen.getByLabelText('Fecha de vencimiento')).toBeDisabled()
    expect(screen.getByLabelText('Recurrente')).toBeDisabled()
    const markPaidToggle = screen.getByLabelText('Ya lo pagué')
    expect(markPaidToggle).not.toBeDisabled()
    expect(markPaidToggle).toHaveAttribute('data-state', 'checked')
  })

  it('does not offer "Eliminar pendiente" for an already-paid pendiente', async () => {
    const { db, householdId, pendiente } = await seedPaidPendiente()

    renderWithProviders(
      <EditPaidPendienteHarness
        db={db}
        householdId={householdId}
        initialEditPendiente={{
          pendienteId: pendiente.id,
          name: 'Gimnasio',
          categoryName: 'Comida',
          dueDate: pendiente.dueDate,
          expectedAmount: 8000,
          recurring: false,
          isPaid: true,
        }}
      />,
    )

    await screen.findByLabelText('Nombre')
    expect(
      screen.queryByRole('button', { name: 'Eliminar pendiente' }),
    ).not.toBeInTheDocument()
  })

  it('disables "Deshacer pago" while "Ya lo pagué" is still checked, since there is nothing to save', async () => {
    const { db, householdId, pendiente } = await seedPaidPendiente()

    renderWithProviders(
      <EditPaidPendienteHarness
        db={db}
        householdId={householdId}
        initialEditPendiente={{
          pendienteId: pendiente.id,
          name: 'Gimnasio',
          categoryName: 'Comida',
          dueDate: pendiente.dueDate,
          expectedAmount: 8000,
          recurring: false,
          isPaid: true,
        }}
      />,
    )

    await screen.findByLabelText('Nombre')
    expect(screen.getByRole('button', { name: 'Deshacer pago' })).toBeDisabled()

    fireEvent.click(screen.getByLabelText('Ya lo pagué'))

    expect(
      screen.getByRole('button', { name: 'Deshacer pago' }),
    ).not.toBeDisabled()
  })

  it('unchecking "Ya lo pagué" and saving restores the pendiente to pending and deletes the Expense it created', async () => {
    const { db, householdId, pendiente } = await seedPaidPendiente({
      name: 'Gimnasio',
      expectedAmount: 8000,
    })

    renderWithProviders(
      <EditPaidPendienteHarness
        db={db}
        householdId={householdId}
        initialEditPendiente={{
          pendienteId: pendiente.id,
          name: 'Gimnasio',
          categoryName: 'Comida',
          dueDate: pendiente.dueDate,
          expectedAmount: 8000,
          recurring: false,
          isPaid: true,
        }}
      />,
    )

    await screen.findByLabelText('Nombre')
    fireEvent.click(screen.getByLabelText('Ya lo pagué'))
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer pago' }))

    await waitFor(async () => {
      const pending = await listPendientes({ db, householdId })
      expect(pending).toEqual([
        expect.objectContaining({ id: pendiente.id, status: 'pending' }),
      ])
    })
    const expenses = await listExpensesInMonth({
      db,
      householdId,
      ...currentMonthRange(),
    })
    expect(expenses).toEqual([])
  })
})

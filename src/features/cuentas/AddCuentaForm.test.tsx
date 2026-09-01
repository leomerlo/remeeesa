import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { listCategories } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  FirestoreDeniedError,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createCuenta, deleteCuenta, listPendingCuentas } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddCuentaForm } from './AddCuentaForm'
import type { EditCuentaTarget } from './AddCuentaForm'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { AddCuentaSheetProps } from './AddCuentaSheet'
import { PendingCuentasList } from './PendingCuentasList'

function AddCuentaSheetHarness(
  props: Omit<AddCuentaSheetProps, 'open' | 'onOpenChange'>,
): ReactElement {
  const [open, setOpen] = useState(false)
  return <AddCuentaSheet open={open} onOpenChange={setOpen} {...props} />
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
    <AddCuentaSheetHarness db={db} householdId={household.id} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
  await screen.findByLabelText('Nombre')
  return { db, householdId: household.id }
}

function fillCuenta(fields: {
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

function submitCuenta(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar cuenta' }))
}

describe('AddCuentaForm', () => {
  it('stores a pending cuenta for the household', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
      expectedAmount: '500',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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
        screen.queryByRole('button', { name: 'Nueva cuenta' }),
      ).toBeInTheDocument()
    })
  })

  it('rejects an empty name', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({ name: '', category: 'Comida', dueDate: '2026-09-10' })
    submitCuenta()

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(
      await listPendingCuentas({ db, householdId }),
    ).toEqual([])
  })

  it('rejects a whitespace-only name', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({ name: '   ', category: 'Comida', dueDate: '2026-09-10' })
    submitCuenta()

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(await listPendingCuentas({ db, householdId })).toEqual([])
  })

  it('rejects an empty category', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({ name: 'Alquiler', category: '   ', dueDate: '2026-09-10' })
    submitCuenta()

    expect(screen.getByRole('alert')).toHaveTextContent(/categoría/i)
    expect(await listPendingCuentas({ db, householdId })).toEqual([])
  })

  it('rejects an empty due date', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({ name: 'Alquiler', category: 'Comida', dueDate: '' })
    submitCuenta()

    expect(screen.getByRole('alert')).toHaveTextContent(/fecha/i)
    expect(await listPendingCuentas({ db, householdId })).toEqual([])
  })

  it('accepts a due date in the past with no validation error, unlike the expense form', async () => {
    const { db, householdId } = await renderForm()

    expect(screen.getByLabelText('Fecha de vencimiento')).not.toHaveAttribute(
      'max',
    )
    expect(screen.getByLabelText('Fecha de vencimiento')).not.toHaveAttribute(
      'min',
    )

    fillCuenta({
      name: 'Vieja deuda',
      category: 'Comida',
      dueDate: '2020-01-01',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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

    fillCuenta({
      name: 'Luz',
      category: 'Servicios',
      dueDate: '2026-09-05',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
      expect(listed).toEqual([
        expect.objectContaining({ name: 'Luz', expectedAmount: null }),
      ])
    })
  })

  it('rejects a negative, zero, or non-numeric expected amount when one is provided', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({
      name: 'Alquiler',
      category: 'Comida',
      dueDate: '2026-09-10',
      expectedAmount: '-1',
    })
    submitCuenta()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    fillCuenta({ expectedAmount: '0' })
    submitCuenta()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    fillCuenta({ expectedAmount: 'abc' })
    submitCuenta()
    expect(screen.getByRole('alert')).toHaveTextContent(/monto/i)

    expect(await listPendingCuentas({ db, householdId })).toEqual([])
  })

  it('creates a new category from free text, reusing the same pick-or-create behavior as the Expense form', async () => {
    const { db, householdId } = await renderForm()

    fillCuenta({
      name: 'Streaming',
      category: 'Suscripciones',
      dueDate: '2026-09-12',
      expectedAmount: '15',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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

    fillCuenta({
      name: 'Supermercado',
      category: '  comida  ',
      dueDate: '2026-09-05',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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

    fillCuenta({
      name: 'Internet',
      category: 'Servicios',
      dueDate: '2026-09-08',
      expectedAmount: '30',
    })
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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

    fillCuenta({
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
    submitCuenta()

    await waitFor(async () => {
      const listed = await listPendingCuentas({ db, householdId })
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
      <AddCuentaSheetHarness db={db} householdId={household.id} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    await screen.findByLabelText('Nombre')

    fillCuenta({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
    })
    submitCuenta()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar la categoría. Volvé a intentar.',
    )
  })

  it('shows which Firestore operation was denied when adding the cuenta', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: base,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const db: HouseholdsDb = {
      ...base,
      createCuenta: async () => {
        throw new FirestoreDeniedError({
          operation: 'createCuenta',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }
    renderWithProviders(
      <AddCuentaSheetHarness db={db} householdId={household.id} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))
    await screen.findByLabelText('Nombre')

    fillCuenta({
      name: 'Alquiler',
      category: 'Servicios',
      dueDate: '2026-09-10',
    })
    submitCuenta()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo agregar la cuenta. Volvé a intentar.',
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
      <AddCuentaSheetHarness db={db} householdId={household.id} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nueva cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar las categorías. Volvé a intentar.',
    )
  })
})

function EditCuentaHarness(props: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): ReactElement {
  const [editCuenta, setEditCuenta] = useState<EditCuentaTarget | null>(null)

  return (
    <>
      <AddCuentaForm
        db={props.db}
        householdId={props.householdId}
        editCuenta={editCuenta}
        onEditFinished={() => {
          setEditCuenta(null)
        }}
      />
      <PendingCuentasList
        db={props.db}
        householdId={props.householdId}
        onEditCuenta={(cuenta, categoryName) => {
          setEditCuenta({
            cuentaId: cuenta.id,
            name: cuenta.name,
            categoryName,
            dueDate: cuenta.dueDate,
            expectedAmount: cuenta.expectedAmount,
            recurring: cuenta.recurring,
          })
        }}
      />
    </>
  )
}

async function seedPendingCuenta(input?: {
  readonly name?: string
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
}): Promise<{
  readonly store: ReturnType<typeof createMemoryHouseholdsDb>
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuenta: Cuenta
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
  const cuenta = await createCuenta({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: input?.name ?? 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount:
      input?.expectedAmount !== undefined ? input.expectedAmount : 500,
    recurring: input?.recurring ?? false,
  })
  return { store, db, householdId: household.id, cuenta }
}

describe('EditCuentaFlow', () => {
  it('opens a pre-filled form when a list row is tapped, including recurring', async () => {
    const { db, householdId } = await seedPendingCuenta({
      name: 'Alquiler',
      expectedAmount: 500,
      recurring: true,
    })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

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

  it('pre-fills a blank expected amount and unchecked recurring when the stored cuenta has them', async () => {
    const { db, householdId } = await seedPendingCuenta({
      name: 'Luz',
      expectedAmount: null,
      recurring: false,
    })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))

    expect(screen.getByLabelText('Monto esperado')).toHaveValue('')
    expect(screen.getByLabelText('Recurrente')).toHaveAttribute(
      'data-state',
      'unchecked',
    )
  })

  it('saves edited fields, including toggling recurring on, and refetches the list', async () => {
    const { db, householdId } = await seedPendingCuenta({
      name: 'Alquiler',
      expectedAmount: 500,
      recurring: false,
    })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

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

    const listed = await listPendingCuentas({ db, householdId })
    expect(listed).toEqual([
      expect.objectContaining({
        name: 'Alquiler nuevo',
        expectedAmount: 600,
        recurring: true,
      }),
    ])
  })

  it('deletes the cuenta from within the edit form after confirming, and refetches the list', async () => {
    const { db, householdId } = await seedPendingCuenta({ name: 'Alquiler' })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }))

    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('¿Eliminar la cuenta?')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Eliminar cuenta' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Guardar cambios' }),
    ).not.toBeInTheDocument()
    expect(await listPendingCuentas({ db, householdId })).toEqual([])
  })

  it('cancels the delete confirmation and keeps the cuenta', async () => {
    const { db, householdId } = await seedPendingCuenta({ name: 'Alquiler' })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }))
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
    expect(await listPendingCuentas({ db, householdId })).toHaveLength(1)
  })

  it('discards edits and leaves the cuenta unchanged via "Cancelar edición"', async () => {
    const { db, householdId } = await seedPendingCuenta({ name: 'Alquiler' })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

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
    const listed = await listPendingCuentas({ db, householdId })
    expect(listed).toEqual([expect.objectContaining({ name: 'Alquiler' })])
  })

  it('closes the edit form with no alert when the cuenta was deleted elsewhere before saving', async () => {
    const { store, db, householdId, cuenta } = await seedPendingCuenta({
      name: 'Alquiler',
    })
    store.seedMembership({ userId: 'user-2', householdId })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    // Simulates a second household member deleting the same cuenta while
    // this member's edit form is still open.
    await deleteCuenta({
      db: store.asUser('user-2'),
      householdId,
      cuentaId: cuenta.id,
    })
    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Stale edit' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Unlike the Expense form's stale-edit case, a gone Cuenta closes
    // silently with no alert -- there is nothing left to save over or retry.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Guardar cambios' }),
      ).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
  })

  it('closes the edit form with no alert when the cuenta was marked paid elsewhere before saving', async () => {
    const { store, db, householdId, cuenta } = await seedPendingCuenta({
      name: 'Alquiler',
    })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    // Simulates the cuenta being marked paid (out of scope of this issue)
    // by someone else while this member's edit form is still open.
    store.seedCuenta({ ...cuenta, status: 'paid', paidExpenseId: 'expense-1' })
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
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
  })

  it('closes the confirmation with no persistent error when deleting a cuenta already deleted elsewhere', async () => {
    const { store, db, householdId, cuenta } = await seedPendingCuenta({
      name: 'Alquiler',
    })
    store.seedMembership({ userId: 'user-2', householdId })

    renderWithProviders(<EditCuentaHarness db={db} householdId={householdId} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }))
    await deleteCuenta({
      db: store.asUser('user-2'),
      householdId,
      cuentaId: cuenta.id,
    })
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar cuenta',
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
  })

  it('shows an alert and keeps the edit form open when deleting fails for another reason', async () => {
    const { db, householdId } = await seedPendingCuenta({ name: 'Alquiler' })
    const failingDb: HouseholdsDb = {
      ...db,
      deleteCuenta: async () => {
        throw new FirestoreDeniedError({
          operation: 'deleteCuenta',
          code: 'permission-denied',
          detail: 'Missing or insufficient permissions.',
        })
      },
    }

    renderWithProviders(
      <EditCuentaHarness db={failingDb} householdId={householdId} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Alquiler' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar cuenta' }))
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Eliminar cuenta',
      }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo eliminar la cuenta',
    )
    // The confirmation dialog closes, but the edit form itself stays open
    // so the failed delete can be retried.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    ).toBeInTheDocument()
  })
})

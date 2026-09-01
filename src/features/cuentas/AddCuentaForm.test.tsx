import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { listCategories } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  FirestoreDeniedError,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listPendingCuentas } from '@/lib/cuentas'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { AddCuentaSheetProps } from './AddCuentaSheet'

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

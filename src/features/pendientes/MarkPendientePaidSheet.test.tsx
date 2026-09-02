import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createPendiente } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MarkPendientePaidSheet } from './MarkPendientePaidSheet'
import type { MarkPendientePaidSheetProps } from './MarkPendientePaidSheet'

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

function MarkPendientePaidSheetHarness(
  props: Omit<MarkPendientePaidSheetProps, 'pendiente' | 'onOpenChange'> & {
    readonly initialPendiente: Pendiente | null
  },
): ReactElement {
  const { initialPendiente, ...rest } = props
  const [pendiente, setPendiente] = useState<Pendiente | null>(initialPendiente)
  return (
    <MarkPendientePaidSheet
      pendiente={pendiente}
      onOpenChange={setPendiente}
      {...rest}
    />
  )
}

async function seedHouseholdWithPendiente(): Promise<{
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
    throw new Error('expected seeded Comida category')
  }
  const pendiente = await createPendiente({
    db,
    householdId: household.id,
    categoryId: comida.id,
    name: 'Alquiler',
    dueDate: new Date(2026, 8, 10),
    expectedAmount: 500,
  })
  return { db, householdId: household.id, pendiente }
}

describe('MarkPendientePaidSheet', () => {
  it('renders nothing when pendiente is null', () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderWithProviders(
      <MarkPendientePaidSheet
        pendiente={null}
        onOpenChange={() => {}}
        db={db}
        householdId="household-1"
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="sheet-content"]'),
    ).not.toBeInTheDocument()
  })

  it('opens with the form pre-filled when pendiente is set', async () => {
    const { db, householdId, pendiente } = await seedHouseholdWithPendiente()

    renderWithProviders(
      <MarkPendientePaidSheet
        pendiente={pendiente}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    expect(await screen.findByLabelText('Monto pagado')).toHaveValue('500')
    expect(
      screen.getByRole('button', { name: 'Marcar pagado' }),
    ).toBeInTheDocument()
  })

  it('closes when onOpenChange(null) fires from within the form', async () => {
    const { db, householdId, pendiente } = await seedHouseholdWithPendiente()

    renderWithProviders(
      <MarkPendientePaidSheetHarness
        initialPendiente={pendiente}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    })
  })

  it('blocks dismiss while a submit is in flight', async () => {
    const { db, householdId, pendiente } = await seedHouseholdWithPendiente()
    const mark = deferred<never>()
    const scopedDb: HouseholdsDb = {
      ...db,
      markPendientePaid: async () => mark.promise,
    }

    renderWithProviders(
      <MarkPendientePaidSheetHarness
        initialPendiente={pendiente}
        db={scopedDb}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    const submitButton = await screen.findByRole('button', {
      name: 'Marcar pagado',
    })
    fireEvent.click(submitButton)

    // The pending flag reaches the sheet through an effect one tick after
    // the mutation starts (mutate() -> isPending -> onPendingChange ->
    // setIsSubmitting), so wait for it to actually land before attempting
    // the dismiss -- otherwise the guard would be checked before it's set,
    // same as a real user's Escape press always arrives well after this.
    await waitFor(() => {
      expect(submitButton).toBeDisabled()
    })

    // The mutation is still pending: an Escape dismiss attempt must be a
    // no-op rather than unmounting the form out from under it.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    expect(screen.getByLabelText('Monto pagado')).toBeInTheDocument()

    mark.reject(new Error('Network blip'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network blip')
    // Still open with the failed draft visible.
    expect(screen.getByLabelText('Monto pagado')).toBeInTheDocument()

    // Once the mutation has settled, the dismiss guard must release.
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    })
  })
})

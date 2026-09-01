import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createCuenta } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MarkCuentaPaidSheet } from './MarkCuentaPaidSheet'
import type { MarkCuentaPaidSheetProps } from './MarkCuentaPaidSheet'

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

function MarkCuentaPaidSheetHarness(
  props: Omit<MarkCuentaPaidSheetProps, 'cuenta' | 'onOpenChange'> & {
    readonly initialCuenta: Cuenta | null
  },
): ReactElement {
  const { initialCuenta, ...rest } = props
  const [cuenta, setCuenta] = useState<Cuenta | null>(initialCuenta)
  return <MarkCuentaPaidSheet cuenta={cuenta} onOpenChange={setCuenta} {...rest} />
}

async function seedHouseholdWithCuenta(): Promise<{
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
    expectedAmount: 500,
  })
  return { db, householdId: household.id, cuenta }
}

describe('MarkCuentaPaidSheet', () => {
  it('renders nothing when cuenta is null', () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderWithProviders(
      <MarkCuentaPaidSheet
        cuenta={null}
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

  it('opens with the form pre-filled when cuenta is set', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta()

    renderWithProviders(
      <MarkCuentaPaidSheet
        cuenta={cuenta}
        onOpenChange={() => {}}
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    expect(await screen.findByLabelText('Monto pagado')).toHaveValue('500')
    expect(
      screen.getByRole('button', { name: 'Marcar pagada' }),
    ).toBeInTheDocument()
  })

  it('closes when onOpenChange(null) fires from within the form', async () => {
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta()

    renderWithProviders(
      <MarkCuentaPaidSheetHarness
        initialCuenta={cuenta}
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
    const { db, householdId, cuenta } = await seedHouseholdWithCuenta()
    const mark = deferred<never>()
    const scopedDb: HouseholdsDb = {
      ...db,
      markCuentaPaid: async () => mark.promise,
    }

    renderWithProviders(
      <MarkCuentaPaidSheetHarness
        initialCuenta={cuenta}
        db={scopedDb}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Flor"
      />,
    )

    const submitButton = await screen.findByRole('button', {
      name: 'Marcar pagada',
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

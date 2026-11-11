import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card as PaymentMethod } from '@/lib/cards'
import type { HouseholdsDb } from '@/lib/households'
import { createPendiente } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PagarSheet } from './ServicioSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// Inside the month the suite's clock is frozen in (25 Sep 2026).
const TODAY = new Date(2026, 8, 20, 12)

async function house(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly bill: Pendiente
  readonly methods: readonly PaymentMethod[]
  readonly session: BetaSession
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const servicios = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Servicios',
  })
  const bill = await createPendiente({
    db,
    householdId: household.id,
    categoryId: servicios.id,
    name: 'Luz',
    dueDate: new Date(2026, 8, 28, 12),
    expectedAmount: 36_800,
    recurring: true,
    autoDebit: false,
    currency: 'ARS',
  })
  return {
    db,
    householdId: household.id,
    bill,
    methods: [],
    session: {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    },
  }
}

// The bill arrives before anybody pays it, and the figure on it is almost
// never the figure that was expected. Writing that figure down is not the
// same as saying the money has left the account -- and until now this
// form could only do the second, so correcting an amount meant claiming a
// payment that had not happened.
describe('paying a servicio', () => {
  it('saves the amount and leaves it waiting', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '41200' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar el monto/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.expectedAmount).toBe(41_200)
    })
    const after = await it.db.getPendiente({
      householdId: it.householdId,
      pendienteId: it.bill.id,
    })
    // Still owed: nobody said it was paid.
    expect(after?.status).toBe('pending')
    expect(after?.paidExpenseId ?? null).toBeNull()
  })

  it('still pays it when that is what was asked', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '41200' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Marcar como pagado/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.status).toBe('paid')
    })
    const after = await it.db.getPendiente({
      householdId: it.householdId,
      pendienteId: it.bill.id,
    })
    expect(after?.paidExpenseId ?? null).not.toBeNull()
  })
})

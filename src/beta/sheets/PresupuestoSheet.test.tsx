import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { monthlyBudgetFor } from '@/lib/households'
import type { Household } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PresupuestoSheet } from './PresupuestoSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// The month the suite's clock sits in (25 Sep 2026).
const MONTH = new Date(2026, 8, 1)

async function house(budget: number): Promise<{
  readonly session: BetaSession
  readonly household: Household
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: budget,
    displayName: 'Flor',
  })
  return {
    household,
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

function open(it: Awaited<ReturnType<typeof house>>): void {
  renderWithProviders(
    <PresupuestoSheet
      open
      onClose={vi.fn()}
      session={it.session}
      household={it.household}
      monthStart={MONTH}
    />,
  )
}

// Taking the budget off was possible all along -- the field accepts
// nothing, and nothing means no ceiling -- but it was said in a line of
// help under the box, where nobody looks for a way out. Per direct
// feedback: "no tengo opción de sacar presupuesto".
describe('taking the budget off', () => {
  it('is offered as an action once there is one', async () => {
    open(await house(500_000))

    expect(
      await screen.findByRole('button', { name: /Quitar el presupuesto/ }),
    ).toBeInTheDocument()
  })

  it('is not offered when the month has none', async () => {
    open(await house(0))

    expect(screen.queryByRole('button', { name: /Quitar/ })).toBeNull()
  })

  it('leaves the month with no ceiling', async () => {
    const it_ = await house(500_000)
    open(it_)

    fireEvent.click(
      screen.getByRole('button', { name: /Quitar el presupuesto/ }),
    )

    await waitFor(async () => {
      const after = await it_.session.db.getHousehold(it_.household.id)
      expect(monthlyBudgetFor(after, MONTH)).toBe(0)
    })
  })
})

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import {
  createPendiente,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CarryRecurrentesSheet } from './CarryRecurrentesSheet'

const VIEWED = new Date(2026, 10, 1) // noviembre
const LAST_MONTH = new Date(2026, 9, 17) // octubre

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 6, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

function render(ui: ReactElement) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>)
}

async function setUp(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
}> {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 1000000,
  })
  const [category] = await listCategories({ db, householdId: household.id })
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  const householdId = household.id
  const add = async (name: string, amount: number, recurring: boolean) => {
    const created = await createPendiente({
      db,
      householdId,
      categoryId: category.id,
      name,
      dueDate: LAST_MONTH,
      expectedAmount: amount,
      recurring,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: created.id,
      memberId: 'user-1',
      authorDisplayName: 'Flor',
      finalAmount: amount,
      paymentDate: LAST_MONTH,
    })
  }
  await add('Luz', 36800, true)
  await add('Gas', 31500, false)
  return { db, householdId }
}

async function open(db: HouseholdsDb, householdId: string): Promise<void> {
  render(
    <CarryRecurrentesSheet
      db={db}
      householdId={householdId}
      monthStart={VIEWED}
    />,
  )
  fireEvent.click(
    await screen.findByRole('button', { name: /Traer del mes pasado/ }),
  )
}

describe('CarryRecurrentesSheet', () => {
  // A bill that was never flagged recurring is offered rather than hidden,
  // because that flag is set a month earlier with the toggle off by
  // default -- but it arrives unticked, so nothing crosses over unasked.
  // Per direct feedback.
  it('ticks the recurring ones and leaves the rest for the member', async () => {
    const { db, householdId } = await setUp()
    await open(db, householdId)

    const recurrentes = await screen.findByRole('list', {
      name: 'Servicios del mes pasado',
    })
    expect(within(recurrentes).getByRole('checkbox')).toBeChecked()
    expect(recurrentes).toHaveTextContent('Luz')

    const resto = screen.getByRole('list', {
      name: 'Otras cuentas del mes pasado',
    })
    expect(within(resto).getByRole('checkbox')).not.toBeChecked()
    expect(resto).toHaveTextContent('Gas')
    expect(screen.getByText('No marcadas como recurrentes')).toBeInTheDocument()

    // Only the ticked one is counted.
    expect(
      screen.getByRole('button', { name: 'Traer 1 servicio' }),
    ).toBeInTheDocument()
  })

  it('carries the one the member ticks, with last month’s amount', async () => {
    const { db, householdId } = await setUp()
    await open(db, householdId)

    const resto = await screen.findByRole('list', {
      name: 'Otras cuentas del mes pasado',
    })
    fireEvent.click(within(resto).getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Traer 2 servicios' }))

    await waitFor(async () => {
      const pending = await listPendientes({ db, householdId })
      expect(pending.map((p) => p.name).sort()).toEqual(['Gas', 'Luz'])
    })
    const pending = await listPendientes({ db, householdId })
    const gas = pending.find((p) => p.name === 'Gas')
    expect(gas?.expectedAmount).toBe(31500)
    // Carried across, it is marked recurring: next month it arrives ticked
    // and nobody has to remember this again.
    expect(gas?.recurring).toBe(true)
  })

  it('can leave a recurring one behind', async () => {
    const { db, householdId } = await setUp()
    await open(db, householdId)

    const recurrentes = await screen.findByRole('list', {
      name: 'Servicios del mes pasado',
    })
    fireEvent.click(within(recurrentes).getByRole('checkbox'))

    expect(
      screen.getByRole('button', { name: 'Traer 0 servicios' }),
    ).toBeInTheDocument()
  })
})

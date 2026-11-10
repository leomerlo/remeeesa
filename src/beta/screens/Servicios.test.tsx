import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthProvider } from '../MonthContext'
import { Servicios } from './Servicios'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// The suite's clock is frozen at 25 Sep 2026, and the screen opens on the
// month that is running.
const DUE = (day: number): Date => new Date(2026, 8, day, 12)

async function house(): Promise<BetaSession> {
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
  const casa = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Casa',
  })
  await db.createPendiente({
    householdId: household.id,
    categoryId: servicios.id,
    name: 'Luz',
    dueDate: DUE(10),
    expectedAmount: 36_800,
    recurring: true,
    autoDebit: false,
    currency: 'ARS',
  })
  await db.createPendiente({
    householdId: household.id,
    categoryId: casa.id,
    name: 'Expensas',
    dueDate: DUE(13),
    expectedAmount: 88_000,
    recurring: true,
    autoDebit: false,
    currency: 'ARS',
  })
  return {
    userId: FLOR,
    householdId: household.id,
    displayName: 'Flor',
    db,
    adopt: vi.fn(),
    rename: vi.fn(),
  }
}

function render(session: BetaSession): void {
  renderWithProviders(
    <MemoryRouter>
      <MonthProvider>
        <Servicios session={session} />
      </MonthProvider>
    </MemoryRouter>,
  )
}

// One box over both tabs: looking for the luz, nobody first wants to
// decide whether they paid it with a card.
describe('looking for a servicio', () => {
  it('narrows the list, and the figure with it', async () => {
    render(await house())

    // Both are there, and the month owes what the two come to.
    expect(await screen.findByText('Luz')).toBeInTheDocument()
    expect(screen.getByText('$124.800')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar un servicio'), {
      target: { value: 'expensas' },
    })

    expect(screen.queryByText('Luz')).toBeNull()
    expect(screen.getByText('Expensas')).toBeInTheDocument()
    // The total is of what is on screen: a figure over a filtered list
    // that still said the whole month would be the one number here
    // nobody could check.
    // Twice over: the hero's figure, and the row's own.
    expect(screen.getAllByText('$88.000')).toHaveLength(2)
  })

  it('finds a bill by its category', async () => {
    render(await house())
    await screen.findByText('Luz')

    fireEvent.change(screen.getByLabelText('Buscar un servicio'), {
      target: { value: 'casa' },
    })

    expect(screen.getByText('Expensas')).toBeInTheDocument()
    expect(screen.queryByText('Luz')).toBeNull()
  })

  it('says a search found nothing, instead of saying the month is empty', async () => {
    render(await house())
    await screen.findByText('Luz')

    fireEvent.change(screen.getByLabelText('Buscar un servicio'), {
      target: { value: 'zzz' },
    })

    expect(screen.getByText(/Nada que coincida/)).toBeInTheDocument()
    expect(screen.queryByText(/No hubo servicios/)).toBeNull()
  })
})

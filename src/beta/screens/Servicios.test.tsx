import { fireEvent, screen, within } from '@testing-library/react'
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


// The figure on one of the three cards above the search, read off that
// card rather than off the screen: the same amount is usually on a row
// below as well, which is the point of the card agreeing with it.
async function heroFigure(label: string): Promise<string> {
  const card = (await screen.findByText(label)).closest('.card')
  if (card === null) throw new Error(`no hero card for ${label}`)
  const figure = card.querySelector('.figure')
  if (figure === null) throw new Error(`no figure on ${label}`)
  // The figures are rendered with a non-breaking space after the sign,
  // which reads identical and compares as different.
  return (figure.textContent ?? '').replace(/\s+/g, ' ').trim()
}

// One box over both tabs: looking for the luz, nobody first wants to
// decide whether they paid it with a card.
describe('looking for a servicio', () => {
  it('narrows the list and leaves the month alone', async () => {
    render(await house())

    // Both are there, and the month owes what the two come to.
    expect(await screen.findByText('Luz')).toBeInTheDocument()
    expect(screen.getByText('$ 124.800')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Buscar un servicio'), {
      target: { value: 'expensas' },
    })

    expect(screen.queryByText('Luz')).toBeNull()
    expect(screen.getByText('Expensas')).toBeInTheDocument()
    // Looking for the expensas does not change what November is. The
    // figures above the search are the month's, always -- they used to
    // be the filtered list's, so typing in the box rewrote the month.
    // Per direct feedback.
    expect(screen.getByText('$ 124.800')).toBeInTheDocument()
    // The badge counts the month too, not what the search left.
    expect(screen.getByText('2 servicios sin pagar')).toBeInTheDocument()
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

// Her own case: Edenor on débito automático with the Visa. The bank is
// never going to take that money out of this month -- it puts it on the
// card and it arrives in the card's resumen -- so the month's side of the
// screen has no business listing it. It did, until the bill was actually
// charged, which is a whole month of it sitting among what the household
// still has to pay.
describe('a servicio a credit card pays', () => {
  async function houseWithEdenorOnTheVisa(): Promise<BetaSession> {
    const session = await house()
    const householdId = session.householdId ?? ''
    const visa = await session.db.createCard({
      householdId,
      name: 'Visa',
      kind: 'credito',
      currency: 'ARS',
      brand: 'visa',
    })
    const servicios = await session.db.findOrCreateCategory({
      householdId,
      name: 'Servicios',
    })
    await session.db.createPendiente({
      householdId,
      categoryId: servicios.id,
      name: 'Edenor',
      dueDate: DUE(18),
      expectedAmount: 42_000,
      recurring: true,
      autoDebit: true,
      paymentMethodId: visa.id,
      currency: 'ARS',
    })
    return session
  }

  it('is not on the month, and the month does not count it', async () => {
    render(await houseWithEdenorOnTheVisa())

    // The two bills nobody put on a card are here, and the figure is
    // theirs alone.
    expect(await screen.findByText('Luz')).toBeInTheDocument()
    expect(screen.getByText('$ 124.800')).toBeInTheDocument()
    expect(screen.queryByText('Edenor')).toBeNull()
  })

  it('is on Con tarjeta, before the bank has taken it', async () => {
    render(await houseWithEdenorOnTheVisa())
    await screen.findByText('Luz')

    fireEvent.click(screen.getByRole('button', { name: 'Con tarjeta' }))

    expect(await screen.findByText('Edenor')).toBeInTheDocument()
    // Twice over: the tab's own figure, and the row's.
    expect(screen.getAllByText('$ 42.000')).toHaveLength(2)
    expect(screen.queryByText('Luz')).toBeNull()
  })
})

// A bill paid in more than one go. The row has one big figure, and which
// figure it is depends on whether anything is still owed: on an open bill
// it is what is left to hand over, and on a settled one it is what the
// bill was worth. A paid row reading $0 is the bug this guards.
describe('a servicio paid in more than one go', () => {
  it('shows what is left, and says how much of how much is in', async () => {
    const session = await house()
    const [expensas] = (
      await session.db.listPendientes({ householdId: session.householdId ?? '' })
    ).filter((bill) => bill.name === 'Expensas')
    if (expensas === undefined) throw new Error('missing Expensas')
    await session.db.payPendientePartially({
      householdId: session.householdId ?? '',
      pendienteId: expensas.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      amount: 50_000,
      paymentDate: DUE(12),
    })

    render(session)

    expect(await screen.findByText('$ 38.000')).toBeInTheDocument()
    expect(
      await screen.findByText('Ya van $ 50.000 de $ 88.000'),
    ).toBeInTheDocument()
    // And the footer asks for the rest, not for the whole thing again.
    expect(
      await screen.findByRole('button', { name: /Pagar lo que falta/ }),
    ).toBeInTheDocument()
  })

  it('shows a settled bill for what it was worth, not for zero', async () => {
    const session = await house()
    const [luz] = (
      await session.db.listPendientes({ householdId: session.householdId ?? '' })
    ).filter((bill) => bill.name === 'Luz')
    if (luz === undefined) throw new Error('missing Luz')
    await session.db.payPendientePartially({
      householdId: session.householdId ?? '',
      pendienteId: luz.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      amount: 16_800,
      paymentDate: DUE(9),
    })
    await session.db.markPendientePaid({
      householdId: session.householdId ?? '',
      pendienteId: luz.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      finalAmount: 20_000,
      paymentDate: DUE(11),
    })

    render(session)

    // Read off that row in particular: the figure beside Luz is the
    // bill, 36.800, and not the nothing it has left to pay.
    const row = await screen.findByRole('button', { name: 'Editar Luz' })
    expect(within(row).getByText('$ 36.800')).toBeInTheDocument()
    expect(within(row).queryByText('$ 0')).not.toBeInTheDocument()
  })
})

// Three figures of one month, not two: what it has already paid, what it
// still owes, and what the card pays for it. Per direct feedback.
describe('the three figures of the month', () => {
  it('counts a settled bill as paid and an open one as owed', async () => {
    const session = await house()
    const [luz] = (
      await session.db.listPendientes({ householdId: session.householdId ?? '' })
    ).filter((bill) => bill.name === 'Luz')
    if (luz === undefined) throw new Error('missing Luz')
    await session.db.markPendientePaid({
      householdId: session.householdId ?? '',
      pendienteId: luz.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      finalAmount: 36_800,
      paymentDate: DUE(9),
    })

    render(session)

    expect(await heroFigure('Servicios que ya pagaste')).toBe('$ 36.800')
    expect(await heroFigure('Servicios que faltan pagar')).toBe('$ 88.000')
  })

  // The half of a part-paid bill that has gone in is money that left the
  // account, so it belongs on the paid side -- and the other half stays
  // owed. Between them they come to the bill, counted once.
  it('splits a part-paid bill across the two figures', async () => {
    const session = await house()
    const [expensas] = (
      await session.db.listPendientes({ householdId: session.householdId ?? '' })
    ).filter((bill) => bill.name === 'Expensas')
    if (expensas === undefined) throw new Error('missing Expensas')
    await session.db.payPendientePartially({
      householdId: session.householdId ?? '',
      pendienteId: expensas.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      amount: 50_000,
      paymentDate: DUE(12),
    })

    render(session)

    // $50.000 out, and $36.800 + $38.000 still owed.
    expect(await heroFigure('Servicios que ya pagaste')).toBe('$ 50.000')
    expect(await heroFigure('Servicios que faltan pagar')).toBe('$ 74.800')
  })
})

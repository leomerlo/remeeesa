import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthProvider } from '../MonthContext'
import { Home } from './Home'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// The suite's clock is frozen at 25 Sep 2026, and Inicio shows the month
// that is running -- so everything below is dated inside September.

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
  await db.createExpense({
    householdId: household.id,
    categoryId: servicios.id,
    memberId: FLOR,
    authorDisplayName: 'Flor',
    name: 'Verdulería',
    price: 12_400,
    comments: '',
    expenseDate: new Date(2026, 8, 20, 12),
    currency: 'ARS',
    paymentMethodId: null,
  })
  await db.createPendiente({
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
    userId: FLOR,
    householdId: household.id,
    displayName: 'Flor',
    db,
    adopt: vi.fn(),
    rename: vi.fn(),
  }
}

// A household that has just signed up: the categories its creation seeds
// and nothing else.
async function emptyHouse(): Promise<BetaSession> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa nueva',
    monthlyBudget: 0,
    displayName: 'Flor',
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
    // Inicio links out to the other screens, so it needs somewhere for
    // those links to point.
    <MemoryRouter>
      <MonthProvider>
        <Home session={session} />
      </MonthProvider>
    </MemoryRouter>,
  )
}

// Inicio shows the same two lists Gastos and Servicios show, so a row on
// it does what the same row does over there. A card that opens something
// on one screen and nothing on another is two cards, and nobody can tell
// which one they are looking at.
describe('the two lists on Inicio', () => {
  it('opens a movement from Últimos gastos', async () => {
    render(await house())

    fireEvent.click(
      await screen.findByRole('button', { name: 'Editar Verdulería' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Editar el gasto' }),
    ).toBeInTheDocument()
  })

  it('opens a bill from Servicios por pagar', async () => {
    render(await house())

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Luz' }))

    expect(
      await screen.findByRole('heading', { name: 'Editar el servicio' }),
    ).toBeInTheDocument()
  })

  // The same fact read three ways depending on the screen: Servicios
  // named the method, a consumo said "Con la tarjeta" and a gasto said
  // nothing. Per direct feedback: "me gusta el método de pago".
  it('names what each movement was paid with', async () => {
    render(await house())

    expect(await screen.findByText('Con efectivo')).toBeInTheDocument()
  })

  // The one thing a bill does not do here. That footer is a row taller
  // than a movement, so with it the two columns stopped matching -- and
  // paying is what the Servicios screen is for.
  it('does not offer to pay from here', async () => {
    render(await house())

    await screen.findByRole('button', { name: 'Editar Luz' })
    expect(screen.queryByRole('button', { name: 'Ya lo pagué' })).toBeNull()
  })

  // The card bill is loaded by hand as a servicio, so both figures have
  // resúmenes inside them and the subtext says so. Her words.
  it('says the servicios figures include the cards', async () => {
    render(await house())

    expect(
      (await screen.findAllByText(/\(Incluye tarjetas de crédito\)/)).length,
    ).toBe(2)
  })
})

// A month spent in dollars was a month with no category at all: the ring
// divides up pesos, and the breakdown dropped any category whose figure
// was zero -- so "Suscripciones", paid entirely in dollars, was nowhere
// on Inicio. Her own case.
describe('a category spent only in dollars', () => {
  it('is listed in the breakdown, with its dollars', async () => {
    const session = await house()
    const householdId = session.householdId ?? ''
    const suscripciones = await session.db.findOrCreateCategory({
      householdId,
      name: 'Suscripciones',
    })
    await session.db.createExpense({
      householdId,
      categoryId: suscripciones.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Spotify',
      price: 4.96,
      comments: '',
      expenseDate: new Date(2026, 8, 5, 12),
      currency: 'USD',
      paymentMethodId: null,
    })
    render(session)

    // The breakdown's own row, not the badge on the movement above it.
    expect(
      await screen.findByRole('button', {
        name: 'Ver los movimientos de Suscripciones',
      }),
    ).toBeInTheDocument()
    // Three times over: the panel's own figure at the top, the movement
    // in the list, and the category's line in the breakdown. The panel
    // used to be the one place on this screen that said nothing about
    // dollars, which on a month spent in them is the first place it has
    // to be said.
    expect(screen.getAllByText('US$ 4,96')).toHaveLength(3)
  })
})

// A household that has just signed up. Inicio used to be headings over
// nothing: "Últimos gastos" with a button through to an empty screen,
// and the Servicios column not drawn at all. Nothing on it said what to
// do first. Per direct feedback: "no hay nada de estados de vacío".
describe('a month with nothing in it yet', () => {
  it('says what each column is for, and offers the way in', async () => {
    render(await emptyHouse())

    expect(
      await screen.findByText('Todavía no hay gastos anotados'),
    ).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay servicios')).toBeInTheDocument()
    expect(
      screen.getByText('Todavía no hay nada para repartir'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Anotar el primero/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Agregar un servicio/ }),
    ).toBeInTheDocument()
  })

  // A way through to a screen with nothing on it is not a next step.
  it('does not offer to see a list that is empty', async () => {
    render(await emptyHouse())
    await screen.findByText('Todavía no hay gastos anotados')

    expect(screen.queryByText('Ver todos los gastos')).toBeNull()
    expect(screen.queryByText('Ver por categoría')).toBeNull()
  })
})

// Her own way of working: the card's statement is loaded by hand as a
// servicio, with the real figure on it, while the app keeps its own
// estimate of the same month on the Resumen it builds from the cuotas.
// They are the same money. The line under the ring counted both for an
// evening -- "se le sumó como un millón de pesos y 20 usd y pico, raro"
// -- so it counts only what somebody wrote down.
describe('what the cards asked of the month', () => {
  async function houseWithACardBillLoadedByHand(): Promise<BetaSession> {
    const db = createMemoryHouseholdsDb().asUser(FLOR)
    const { household } = await db.createHouseholdAndMembership({
      userId: FLOR,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const tarjetas = await db.findOrCreateCategory({
      householdId: household.id,
      name: 'Tarjetas de Crédito',
    })
    const ropa = await db.findOrCreateCategory({
      householdId: household.id,
      name: 'Ropa',
    })
    const visa = await db.createCard({
      householdId: household.id,
      name: 'Visa',
      kind: 'credito',
      currency: 'ARS',
      brand: 'visa',
    })
    // Bought in August, so its one cuota lands in September's Resumen --
    // which nobody has written a figure on.
    await db.createCardPurchase({
      householdId: household.id,
      cardId: visa.id,
      categoryId: ropa.id,
      resumenCategoryId: tarjetas.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Zapatillas',
      total: 90_000,
      cuotas: 1,
      purchaseDate: new Date(2026, 7, 10, 12),
      comments: '',
      currency: 'ARS',
    })
    // Something ordinary in the month, so there is a ring for the line
    // to sit under: the breakdown draws nothing at all otherwise.
    await db.createExpense({
      householdId: household.id,
      categoryId: ropa.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: 'Medias',
      price: 8_000,
      comments: '',
      expenseDate: new Date(2026, 8, 20, 12),
      currency: 'ARS',
      paymentMethodId: null,
    })
    // And the statement itself, loaded by hand with the final figure.
    await db.createPendiente({
      householdId: household.id,
      categoryId: tarjetas.id,
      name: 'Visa septiembre',
      dueDate: new Date(2026, 8, 15, 12),
      expectedAmount: 120_000,
      recurring: false,
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

  it('counts the statement once, not the estimate beside it', async () => {
    render(await houseWithACardBillLoadedByHand())

    const alert = await screen.findByText(
      (_, element) =>
        element?.tagName === 'P' &&
        (element.textContent ?? '').includes('los resúmenes de las tarjetas'),
    )
    // The figure she typed, and not a peso more: the app's own estimate
    // of the same month is the same money said twice.
    expect(alert).toHaveTextContent('120.000')
    expect(alert).not.toHaveTextContent('210.000')
  })
})

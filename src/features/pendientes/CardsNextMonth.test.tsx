import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCard, createCardPurchase } from '@/lib/cards'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CardsNextMonth } from './CardsNextMonth'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 1000,
  })
  const householdId = household.id
  const [category] = await listCategories({ db, householdId })
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  const buy = async (cardName: string, total: number, purchaseDate: Date) => {
    const cards = await db.listCards({ householdId })
    const card =
      cards.find((candidate) => candidate.name === cardName) ??
      (await createCard({ db, householdId, name: cardName }))
    await createCardPurchase({
      db,
      householdId,
      cardId: card.id,
      categoryId: category.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Compra',
      total,
      cuotas: 1,
      purchaseDate,
      comments: '',
    })
  }
  return { db, householdId, buy }
}

describe('CardsNextMonth', () => {
  it("sums every card's unpaid Resumen due next month", async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 100, new Date(2026, 8, 5))
    await buy('Master', 50.5, new Date(2026, 8, 6))
    // Lands in September, this month: not counted.
    await buy('Visa', 999, new Date(2026, 7, 6))

    renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
    )

    const card = await screen.findByRole('button', {
      name: /Tarjetas el mes que viene/,
    })
    expect(card).toHaveTextContent('$150,50')
  })

  // It used to be pinned to the real calendar month, so paging Home to
  // another month left this showing the same number over and over. Per
  // direct feedback: tiene que mostrar la data del mes que corresponde.
  it('follows the month Home is showing, not today', async () => {
    const { db, householdId, buy } = await setup()
    // Lands in October's Resumen -- next month, seen from September.
    await buy('Visa', 100, new Date(2026, 8, 5))
    // Lands in September's -- next month, seen from August.
    await buy('Master', 70, new Date(2026, 7, 6))

    const { unmount } = renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
    )
    expect(
      await screen.findByRole('button', { name: /Tarjetas el mes que viene/ }),
    ).toHaveTextContent('$100')
    unmount()

    // Paging Home back a month: the same data, a different figure.
    renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 7, 1)}
      />,
    )
    expect(
      await screen.findByRole('button', { name: /Tarjetas el mes que viene/ }),
    ).toHaveTextContent('$70')
  })

  // The figure is a summary of movements, so the obvious thing to want is
  // to see them. Read-only: these are bills that have not arrived. Per
  // direct feedback.
  it('opens the consumos behind the figure, each under its own bill', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 100, new Date(2026, 8, 5))
    await buy('Master', 50.5, new Date(2026, 8, 6))

    renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Tarjetas el mes que viene/,
      }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Tarjetas el mes que viene',
    })
    expect(
      await within(dialog).findByRole('list', { name: 'Consumos de Visa' }),
    ).toHaveTextContent('$100')
    expect(
      within(dialog).getByRole('list', { name: 'Consumos de Master' }),
    ).toHaveTextContent('$50,50')
    // Nothing here can be paid: it is an estimate of bills that have not
    // arrived.
    expect(
      within(dialog).queryByRole('button', { name: /Pagar/ }),
    ).not.toBeInTheDocument()
  })

  // Her screen: a card's heading read US$13,99 with US$13,99 and US$97
  // listed under it, because a figure typed by hand replaced the estimate.
  // That figure cannot be typed any more -- a card bill is an estimate
  // until it is paid -- and a document still carrying one from the old
  // model is ignored while it is unpaid.
  it('heads each card with the sum of the consumos listed under it', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa Flor', 97, new Date(2026, 8, 1))
    await buy('Visa Flor', 13.99, new Date(2026, 8, 2))

    renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: /Tarjetas el mes que viene/,
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Tarjetas el mes que viene',
    })
    const section = await within(dialog).findByRole('region', {
      name: /^Visa Flor de/,
    })

    // The sum of the two consumos listed under it.
    expect(within(section).getByText('$110,99')).toBeInTheDocument()
    // Nothing is said about a bill: none has been paid, so there is no
    // figure to compare the estimate against.
    expect(section).not.toHaveTextContent('Pagaste')
  })

  // Where the household actually meets a consumo it no longer has. Deleting
  // it used to mean finding it in Histórico, in the month it was bought --
  // a date you have to remember to get rid of something you are looking
  // straight at. Per direct feedback.
  it('deletes a consumo from the bill it is listed under', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 100, new Date(2026, 8, 5))

    renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', {
        name: /Tarjetas el mes que viene/,
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Tarjetas el mes que viene',
    })
    fireEvent.click(
      await within(dialog).findByRole('button', { name: 'Eliminar Compra' }),
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Eliminar el consumo' }),
    )

    await waitFor(async () => {
      const left = await db.listCardPurchasesInMonth({
        householdId,
        monthStart: new Date(2026, 8, 1),
        monthEnd: new Date(2026, 8, 30, 23, 59, 59, 999),
      })
      expect(left).toHaveLength(0)
    })
  })

  it('renders nothing when no card is due next month', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 999, new Date(2026, 7, 6))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { container } = renderWithProviders(
      <CardsNextMonth
        db={db}
        householdId={householdId}
        monthStart={new Date(2026, 8, 1)}
      />,
      { queryClient },
    )

    await waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .find({ queryKey: ['pendientes', householdId] })?.state.status,
      ).toBe('success')
    })
    expect(container).toBeEmptyDOMElement()
  })
})

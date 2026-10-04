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

    renderWithProviders(<CardsNextMonth db={db} householdId={householdId} />)

    const card = await screen.findByRole('button', {
      name: /Tarjetas el mes que viene/,
    })
    expect(card).toHaveTextContent('$150,50')
  })

  // The figure is a summary of movements, so the obvious thing to want is
  // to see them. Read-only: these are bills that have not arrived. Per
  // direct feedback.
  it('opens the consumos behind the figure, each under its own bill', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 100, new Date(2026, 8, 5))
    await buy('Master', 50.5, new Date(2026, 8, 6))

    renderWithProviders(<CardsNextMonth db={db} householdId={householdId} />)

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

  it('renders nothing when no card is due next month', async () => {
    const { db, householdId, buy } = await setup()
    await buy('Visa', 999, new Date(2026, 7, 6))

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { container } = renderWithProviders(
      <CardsNextMonth db={db} householdId={householdId} />,
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

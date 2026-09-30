import { QueryClient } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
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

    const section = await screen.findByRole('region', {
      name: 'Tarjetas el mes que viene',
    })
    expect(section).toHaveTextContent('$150,50')
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

import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { createCard, createCardPurchase } from '@/lib/cards'
import type { CardCurrency, Currency } from '@/lib/money'
import { writeDolarBlueOverride } from '@/lib/dolarBlueOverride'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthProvider } from '../MonthContext'
import { Tarjetas } from './Tarjetas'
import type { BetaSession } from '../data'

const FLOR = 'flor'

async function house(
  cardCurrency: CardCurrency,
  purchases: readonly { readonly total: number; readonly currency: Currency }[],
): Promise<BetaSession> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const casa = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Casa',
  })
  const card = await createCard({
    db,
    householdId: household.id,
    name: 'Visa',
    currency: cardCurrency,
  })
  for (const { total, currency } of purchases) {
    await createCardPurchase({
      db,
      householdId: household.id,
      cardId: card.id,
      categoryId: casa.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name: `Compra en ${currency}`,
      total,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5, 12),
      comments: '',
      currency,
    })
  }
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
        <Tarjetas session={session} />
      </MonthProvider>
    </MemoryRouter>,
  )
}

function normalized(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/gu, ' ').trim()
}

describe('the hero of the cards screen, in pesos', () => {
  it('adds the dollars at the blue rate to the pesos', async () => {
    writeDolarBlueOverride(1600, 'venta')
    render(
      await house('BOTH', [
        { total: 50_000, currency: 'ARS' },
        { total: 10, currency: 'USD' },
      ]),
    )

    const line = await screen.findByText(/con el dólar blue a/u)
    expect(normalized(line.textContent)).toBe(
      'En pesos, $ 66.000 con el dólar blue a $1.600',
    )
  })

  it('says nothing when the resúmenes are all in pesos', async () => {
    writeDolarBlueOverride(1600, 'venta')
    render(await house('ARS', [{ total: 50_000, currency: 'ARS' }]))

    await screen.findByText('Los resúmenes de octubre', { exact: false })
    expect(screen.queryByText(/con el dólar blue a/u)).not.toBeInTheDocument()
  })

  it('says nothing while there is no rate to convert at', async () => {
    render(await house('USD', [{ total: 10, currency: 'USD' }]))

    await screen.findByText('Los resúmenes de octubre', { exact: false })
    expect(screen.queryByText(/con el dólar blue a/u)).not.toBeInTheDocument()
  })
})

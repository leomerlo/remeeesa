import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCard, createCardPurchase } from '@/lib/cards'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ResumenSheet } from './ResumenSheet'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResumenSheet', () => {
  it("shows an error, not an empty Resumen, when its purchases can't be read", async () => {
    const memoryDb = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: memoryDb,
      userId: 'user-1',
      name: 'Casa',
      monthlyBudget: 1000,
    })
    const householdId = household.id
    const [category] = await listCategories({ db: memoryDb, householdId })
    if (category === undefined) {
      throw new Error('expected a seeded category')
    }
    const visa = await createCard({ db: memoryDb, householdId, name: 'Visa' })
    await createCardPurchase({
      db: memoryDb,
      householdId,
      cardId: visa.id,
      categoryId: category.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Zapatillas',
      total: 120,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
    })
    const [resumen] = await listPendientes({ db: memoryDb, householdId })
    if (resumen === undefined) {
      throw new Error('expected a Resumen')
    }
    const db: HouseholdsDb = {
      ...memoryDb,
      getCardPurchases: () =>
        Promise.reject(new Error('No se pudo cargar las compras del resumen')),
    }

    renderWithProviders(
      <ResumenSheet
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar las compras del resumen',
    )
    expect(
      screen.queryByRole('list', { name: 'Cuotas del resumen' }),
    ).not.toBeInTheDocument()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthlyTotalsChart } from './MonthlyTotalsChart'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

describe('MonthlyTotalsChart', () => {
  it('renders nothing when there is no spend in any of the last 6 months', async () => {
    const { db, householdId } = await seedHousehold()

    const { container } = renderWithProviders(
      <MonthlyTotalsChart db={db} householdId={householdId} />,
    )

    // Loading resolves to nothing rather than an empty chart -- wait for the
    // skeleton (present on the first render) to clear before asserting.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Por mes')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a bar per month, labels each month, and highlights the current month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 15)) // September 15, 2026
      const { db, householdId, categoryId } = await seedHousehold()

      await createExpense({
        db,
        householdId,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Alquiler',
        price: 300,
        comments: '',
        expenseDate: new Date(2026, 6, 5), // July
      })
      await createExpense({
        db,
        householdId,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Super',
        price: 120,
        comments: '',
        expenseDate: new Date(2026, 8, 10), // September (current month)
      })

      renderWithProviders(
        <MonthlyTotalsChart db={db} householdId={householdId} />,
      )

      const chart = await screen.findByRole('list', {
        name: 'Gasto total por mes',
      })
      const bars = within(chart).getAllByRole('listitem')
      // MONTHLY_TOTALS_MONTH_COUNT months: April through September.
      expect(bars).toHaveLength(6)
      expect(bars[0]).toHaveTextContent('abr')
      expect(bars[5]).toHaveTextContent('sept')
      expect(
        within(bars[3] as HTMLElement).getByText('$300,00'),
      ).toBeInTheDocument() // July
      expect(
        within(bars[5] as HTMLElement).getByText('$120,00'),
      ).toBeInTheDocument() // September
      // Every other month had no spend at all.
      expect(
        within(bars[0] as HTMLElement).getByText('$0,00'),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

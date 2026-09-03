import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PendienteDueSoonBanner } from './PendienteDueSoonBanner'

async function findCategoryId(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly name: string
}): Promise<string> {
  const categories = await listCategories({
    db: input.db,
    householdId: input.householdId,
  })
  const found = categories.find((category) => category.name === input.name)
  if (found === undefined) {
    throw new Error(`expected seeded category ${input.name}`)
  }
  return found.id
}

describe('PendienteDueSoonBanner', () => {
  it('renders nothing when the household has no pendientes at all', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const { container } = renderWithProviders(
      <PendienteDueSoonBanner db={db} householdId={household.id} />,
    )

    // Skeleton first (while the query is pending), then nothing at all --
    // no empty-state card either.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when nothing is due within the next week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 10))
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
      })
      const categoryId = await findCategoryId({
        db,
        householdId: household.id,
        name: 'Comida',
      })
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Seguro anual',
        dueDate: new Date(2026, 9, 1),
        expectedAmount: 20000,
      })

      renderWithProviders(
        <PendienteDueSoonBanner db={db} householdId={household.id} />,
      )

      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
      })
      expect(
        screen.queryByText('Vencimientos que se acercan'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows unpaid pendientes due within the next week, soonest first, and excludes paid or far-off ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 10))
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
      })
      const categoryId = await findCategoryId({
        db,
        householdId: household.id,
        name: 'Comida',
      })

      const soon = await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Internet',
        dueDate: new Date(2026, 8, 15),
        expectedAmount: 5000,
      })
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Luz',
        dueDate: new Date(2026, 8, 12),
        expectedAmount: 3000,
      })
      // Already paid -- excluded even though the due date is close.
      const paid = await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Gas',
        dueDate: new Date(2026, 8, 11),
        expectedAmount: 1000,
      })
      await markPendientePaid({
        db,
        householdId: household.id,
        pendienteId: paid.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        finalAmount: 1000,
        paymentDate: new Date(2026, 8, 10),
      })
      // More than a week out -- excluded.
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Seguro anual',
        dueDate: new Date(2026, 9, 1),
        expectedAmount: 20000,
      })

      renderWithProviders(
        <PendienteDueSoonBanner db={db} householdId={household.id} />,
      )

      const list = await screen.findByRole('list', {
        name: 'Vencimientos próximos',
      })
      const rows = within(list).getAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Luz')
      expect(rows[1]).toHaveTextContent('Internet')
      expect(screen.queryByText('Gas')).not.toBeInTheDocument()
      expect(screen.queryByText('Seguro anual')).not.toBeInTheDocument()
      expect(soon.name).toBe('Internet')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows one dot per upcoming vencimiento, the first marked active, and none at all for a single one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 10))
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
      })
      const categoryId = await findCategoryId({
        db,
        householdId: household.id,
        name: 'Comida',
      })
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Internet',
        dueDate: new Date(2026, 8, 15),
        expectedAmount: 5000,
      })
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Luz',
        dueDate: new Date(2026, 8, 12),
        expectedAmount: 3000,
      })

      renderWithProviders(
        <PendienteDueSoonBanner db={db} householdId={household.id} />,
      )

      const dots = await screen.findAllByRole('tab')
      expect(dots).toHaveLength(2)
      expect(dots[0]).toHaveAttribute('aria-selected', 'true')
      expect(dots[1]).toHaveAttribute('aria-selected', 'false')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not show dots when there is only one vencimiento to page through', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 10))
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
      })
      const categoryId = await findCategoryId({
        db,
        householdId: household.id,
        name: 'Comida',
      })
      await createPendiente({
        db,
        householdId: household.id,
        categoryId,
        name: 'Internet',
        dueDate: new Date(2026, 8, 15),
        expectedAmount: 5000,
      })

      renderWithProviders(
        <PendienteDueSoonBanner db={db} householdId={household.id} />,
      )

      await screen.findByText('Internet')
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createCuenta } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PorPagarSection } from './PorPagarSection'

function renderSection(ui: ReactElement, queryClient?: QueryClient) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>, {
    ...(queryClient === undefined ? {} : { queryClient }),
  })
}

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  return { db, householdId: household.id, categoryId: category.id }
}

// Due dates are days apart so ordering assertions are unambiguous.
async function seedCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dayOfMonth: number
  readonly expectedAmount?: number | null
}): Promise<Cuenta> {
  return createCuenta({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: input.name,
    dueDate: new Date(2026, 10, input.dayOfMonth),
    expectedAmount: input.expectedAmount ?? null,
  })
}

describe('PorPagarSection', () => {
  it('renders nothing at all when there are no pending cuentas', async () => {
    const { db, householdId } = await seedHousehold()

    const { container } = renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    // Skeleton first, then the section removes itself entirely -- no empty box.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Por pagar')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows its own loading skeleton before the cuentas resolve', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dayOfMonth: 5,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
    expect(await screen.findByText('Internet')).toBeInTheDocument()
  })

  it('lists pending cuentas soonest-due-first with name, category, date and amount', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Luz',
      dayOfMonth: 20,
      expectedAmount: 78.25,
    })
    await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dayOfMonth: 5,
      expectedAmount: 120,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', {
      name: 'Cuentas por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Soonest due (day 5) first, not insertion order.
    expect(items[0]).toHaveTextContent('Internet')
    expect(items[0]).toHaveTextContent('$120,00')
    expect(items[1]).toHaveTextContent('Luz')
    expect(items[1]).toHaveTextContent('$78,25')
  })

  it('omits the amount for a cuenta with no expected amount, without breaking the card', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Expensas',
      dayOfMonth: 9,
      expectedAmount: null,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const card = await screen.findByRole('button', {
      name: 'Marcar pagada Expensas',
    })
    expect(card).toHaveTextContent('Expensas')
    expect(card).not.toHaveTextContent('$')
  })

  it('caps the preview at 5 and only then offers the overflow link', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= 5; day += 1) {
      await seedCuenta({
        db,
        householdId,
        categoryId,
        name: `Cuenta ${String(day)}`,
        dayOfMonth: day,
      })
    }

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', { name: 'Cuentas por pagar' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    // Exactly at the cap, nothing is hidden, so no overflow link.
    expect(
      screen.queryByRole('link', { name: 'Ver todas' }),
    ).not.toBeInTheDocument()
  })

  it('shows only the 5 soonest and links to the full list when more are pending', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= 7; day += 1) {
      await seedCuenta({
        db,
        householdId,
        categoryId,
        name: `Cuenta ${String(day)}`,
        dayOfMonth: day,
      })
    }

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', { name: 'Cuentas por pagar' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    // The two latest-due ones are the ones dropped.
    expect(screen.getByText('Cuenta 1')).toBeInTheDocument()
    expect(screen.getByText('Cuenta 5')).toBeInTheDocument()
    expect(screen.queryByText('Cuenta 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Cuenta 7')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute(
      'href',
      '/cuentas',
    )
  })

  it('hands the tapped cuenta to onMarkPaid', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const cuenta = await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Agua',
      dayOfMonth: 12,
      expectedAmount: 45.5,
    })
    const onMarkPaid = vi.fn()

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={onMarkPaid}
      />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagada Agua' }),
    )

    expect(onMarkPaid).toHaveBeenCalledTimes(1)
    expect(onMarkPaid.mock.calls[0]?.[0]).toMatchObject({
      id: cuenta.id,
      name: 'Agua',
    })
  })

  it('degrades to rendering nothing when the query fails, rather than erroring the whole screen', async () => {
    const store = createMemoryHouseholdsDb()
    const owner = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: owner,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // A non-member db makes listPendingCuentas reject.
    const { container } = renderSection(
      <PorPagarSection
        db={store.asUser('user-2')}
        householdId={household.id}
        onMarkPaid={vi.fn()}
      />,
      queryClient,
    )

    await waitFor(() => {
      expect(
        queryClient
          .getQueryCache()
          .findAll()
          .some((query) => query.state.status === 'error'),
      ).toBe(true)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  // scroll-px-6 is load-bearing: snap-mandatory snaps to the first card's own
  // start edge, scrolling the row's 24px left padding away and leaving that
  // card flush against the screen edge, out of line with every other section
  // on Home.
  it('keeps the scroller aligned to the page gutter under scroll snapping', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedCuenta({
      db,
      householdId,
      categoryId,
      name: 'Luz',
      dayOfMonth: 4,
      expectedAmount: 28000,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', {
      name: 'Cuentas por pagar',
    })
    expect(list.className).toContain('snap-mandatory')
    expect(list.className).toContain('scroll-px-6')
  })
})

import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
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
async function seedPendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dayOfMonth: number
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
}): Promise<Pendiente> {
  return createPendiente({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: input.name,
    dueDate: new Date(2026, 10, input.dayOfMonth),
    expectedAmount: input.expectedAmount ?? null,
    recurring: input.recurring ?? false,
  })
}

describe('PorPagarSection', () => {
  it('renders nothing at all when there are no pending pendientes', async () => {
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

  it('shows its own loading skeleton before the pendientes resolve', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
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

  it('lists pending pendientes soonest-due-first with name, category, date and amount', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Luz',
      dayOfMonth: 20,
      expectedAmount: 78.25,
    })
    await seedPendiente({
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

    expect(
      await screen.findByRole('heading', { name: 'Cuentas por pagar' }),
    ).toBeInTheDocument()
    const list = await screen.findByRole('list', {
      name: 'Pendientes por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Soonest due (day 5) first, not insertion order.
    expect(items[0]).toHaveTextContent('Internet')
    expect(items[0]).toHaveTextContent('$120,00')
    expect(items[1]).toHaveTextContent('Luz')
    expect(items[1]).toHaveTextContent('$78,25')
  })

  it('omits the amount for a pendiente with no expected amount, without breaking the card', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
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
      name: 'Marcar pagado Expensas',
    })
    expect(card).toHaveTextContent('Expensas')
    expect(card).not.toHaveTextContent('$')
  })

  it('shows a placeholder amount for a recurring pendiente with no expected amount yet', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gimnasio',
      dayOfMonth: 9,
      expectedAmount: null,
      recurring: true,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const card = await screen.findByRole('button', {
      name: 'Marcar pagado Gimnasio',
    })
    expect(card).toHaveTextContent('$ --,--')
  })

  it('caps the preview at 5 and only then offers the overflow link', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= 5; day += 1) {
      await seedPendiente({
        db,
        householdId,
        categoryId,
        name: `Pendiente ${String(day)}`,
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

    const list = await screen.findByRole('list', {
      name: 'Pendientes por pagar',
    })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    // Exactly at the cap, nothing is hidden, so no overflow link.
    expect(
      screen.queryByRole('link', { name: 'Ver todas' }),
    ).not.toBeInTheDocument()
  })

  it('shows only the 5 soonest and links to the full list when more are pending', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    for (let day = 1; day <= 7; day += 1) {
      await seedPendiente({
        db,
        householdId,
        categoryId,
        name: `Pendiente ${String(day)}`,
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

    const list = await screen.findByRole('list', {
      name: 'Pendientes por pagar',
    })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    // The two latest-due ones are the ones dropped.
    expect(screen.getByText('Pendiente 1')).toBeInTheDocument()
    expect(screen.getByText('Pendiente 5')).toBeInTheDocument()
    expect(screen.queryByText('Pendiente 6')).not.toBeInTheDocument()
    expect(screen.queryByText('Pendiente 7')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute(
      'href',
      '/pendientes',
    )
  })

  it('hands the tapped pendiente to onMarkPaid', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const pendiente = await seedPendiente({
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
      await screen.findByRole('button', { name: 'Marcar pagado Agua' }),
    )

    expect(onMarkPaid).toHaveBeenCalledTimes(1)
    expect(onMarkPaid.mock.calls[0]?.[0]).toMatchObject({
      id: pendiente.id,
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

    // A non-member db makes listPendientes reject.
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

  it('shows a pendiente paid this month with a "Pagado" badge, not as a mark-paid button', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const pendiente = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gas',
      dayOfMonth: 10,
      expectedAmount: 1000,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 1000,
      paymentDate: new Date(),
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', {
      name: 'Pendientes por pagar',
    })
    const row = within(list).getByText('Gas').closest('li')
    expect(row).not.toBeNull()
    expect(row).toHaveTextContent('Pagado')
    expect(
      within(row as HTMLElement).queryByRole('button'),
    ).not.toBeInTheDocument()
  })

  it('lists a pending pendiente before one paid this month', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const paid = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gas',
      dayOfMonth: 10,
      expectedAmount: 1000,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: paid.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 1000,
      paymentDate: new Date(),
    })
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dayOfMonth: 20,
      expectedAmount: 500,
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
      />,
    )

    const list = await screen.findByRole('list', {
      name: 'Pendientes por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Internet')
    expect(items[1]).toHaveTextContent('Gas')
  })

  it('does not show a pendiente paid in a different viewed month', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const paid = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gas',
      dayOfMonth: 10,
      expectedAmount: 1000,
    })
    // Paid in the past, well outside the viewed month below.
    await markPendientePaid({
      db,
      householdId,
      pendienteId: paid.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 1000,
      paymentDate: new Date(2026, 0, 15),
    })

    renderSection(
      <PorPagarSection
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
        monthStart={new Date(2026, 5, 1)}
        monthEnd={new Date(2026, 5, 30, 23, 59, 59, 999)}
      />,
    )

    // Nothing else pending and nothing paid in the *viewed* month -- the
    // section removes itself entirely, same as the empty-state test above.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Gas')).not.toBeInTheDocument()
  })
})

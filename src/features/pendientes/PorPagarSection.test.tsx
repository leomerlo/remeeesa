import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ComponentProps, ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { createCard, createCardPurchase } from '@/lib/cards'
import { PorPagarSection } from './PorPagarSection'

// A card purchase dated the 1st of this month (never in the future) lands
// its single cuota in next month's Resumen.
async function seedResumen(
  db: HouseholdsDb,
  householdId: string,
  categoryId: string,
) {
  const now = new Date()
  const card = await createCard({ db, householdId, name: 'Visa' })
  await createCardPurchase({
    db,
    householdId,
    cardId: card.id,
    categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Zapatillas',
    total: 120,
    cuotas: 1,
    purchaseDate: new Date(now.getFullYear(), now.getMonth(), 1),
    comments: '',
  })
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    monthEnd: new Date(
      now.getFullYear(),
      now.getMonth() + 2,
      0,
      23,
      59,
      59,
      999,
    ),
  }
}

// Next month's Resumen then holds cuota 1/1 of Zapatillas (seedResumen) and
// cuota 2/3 of a Heladera bought on the 1st of last month.
async function seedTwoCuotaResumen(
  db: HouseholdsDb,
  householdId: string,
  categoryId: string,
) {
  const month = await seedResumen(db, householdId, categoryId)
  const [card] = await db.listCards({ householdId })
  if (card === undefined) {
    throw new Error('expected the seeded card')
  }
  const now = new Date()
  const heladeraDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  await createCardPurchase({
    db,
    householdId,
    cardId: card.id,
    categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Heladera',
    total: 300,
    cuotas: 3,
    purchaseDate: heladeraDate,
    comments: '',
  })
  return { month, heladeraDate }
}

function formatLongDate(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())}`
}

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

// The section only shows what is due in the month it is given, so every
// seeded due date lands in one fixed month and every render pins that same
// month. A test that cares about a different month passes its own props,
// which win over these.
const MONTH_START = new Date(2026, 10, 1)
const MONTH_END = new Date(2026, 11, 0, 23, 59, 59, 999)

function Section(props: ComponentProps<typeof PorPagarSection>): ReactElement {
  return (
    <PorPagarSection monthStart={MONTH_START} monthEnd={MONTH_END} {...props} />
  )
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    expect(
      await screen.findByRole('heading', {
        name: 'Servicios o pagos recurrentes',
      }),
    ).toBeInTheDocument()
    const list = await screen.findByRole('list', {
      name: 'Servicios por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    // Soonest due (day 5) first, not insertion order.
    expect(items[0]).toHaveTextContent('Internet')
    expect(items[0]).toHaveTextContent('$120')
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    const card = await screen.findByRole('button', {
      name: 'Marcar pagado Gimnasio',
    })
    expect(card).toHaveTextContent('$ --,--')
  })

  // Per direct feedback: back to a carousel, and this time with no preview
  // cap at all -- every pending/paid-this-month pendiente shows, however
  // many there are.
  it('shows every pendiente, with no cap, ordered soonest-due-first', async () => {
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    const list = await screen.findByRole('list', {
      name: 'Servicios por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items[0]).toHaveTextContent('Pendiente 1')
    expect(items[6]).toHaveTextContent('Pendiente 7')
  })

  // No longer an overflow escape hatch (every pendiente already shows), but
  // still the only way to reach Pendientes' own edit/delete management,
  // which isn't in the bottom nav -- so it stays, unconditionally.
  it('always links to Pendientes, regardless of how many are shown', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dayOfMonth: 5,
    })

    renderSection(
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    expect(
      await screen.findByRole('link', { name: 'Ver todas' }),
    ).toHaveAttribute('href', '/pendientes')
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
      <Section db={db} householdId={householdId} onMarkPaid={onMarkPaid} />,
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
      <Section
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

  // Per direct feedback: a one-off bill ("Osde Flor", paid once and done)
  // lingering under "Cuentas por pagar" reads as something still to do.
  // Once paid, a bill belongs to Histórico, not here.
  it('drops a pendiente from the list as soon as it is paid', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Internet',
      dayOfMonth: 5,
      expectedAmount: 500,
    })
    const paid = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Osde Flor',
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

    renderSection(
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    const list = await screen.findByRole('list', {
      name: 'Servicios por pagar',
    })
    expect(within(list).getByText('Internet')).toBeInTheDocument()
    expect(within(list).queryByText('Osde Flor')).not.toBeInTheDocument()
    expect(screen.queryByText('Pagado')).not.toBeInTheDocument()
  })

  it('renders nothing at all once every bill is paid', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const paid = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Osde Flor',
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

    const { container } = renderSection(
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(container).toBeEmptyDOMElement()
  })

  it('removes itself once the only recurring bill this month is paid', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const gym = await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gimnasio',
      dayOfMonth: 10,
      expectedAmount: 8000,
      recurring: true,
    })
    await markPendientePaid({
      db,
      householdId,
      pendienteId: gym.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 8000,
      paymentDate: new Date(),
    })

    const { container } = renderSection(
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    // Nothing is owed for this month any more, so the section removes
    // itself entirely.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Gimnasio')).not.toBeInTheDocument()
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps showing what is still owed after another bill is paid', async () => {
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
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    const list = await screen.findByRole('list', {
      name: 'Servicios por pagar',
    })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Internet')
    expect(within(list).queryByText('Gas')).not.toBeInTheDocument()
  })

  it('does not show a bill due in another month', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gas',
      dayOfMonth: 10,
      expectedAmount: 1000,
    })

    // Same unpaid bill, viewed from the month before the one it is due in.
    renderSection(
      <Section
        db={db}
        householdId={householdId}
        onMarkPaid={vi.fn()}
        monthStart={new Date(2026, 9, 1)}
        monthEnd={new Date(2026, 9, 31, 23, 59, 59, 999)}
      />,
    )

    // Nothing due in the viewed month -- the section removes itself
    // entirely, same as the empty-state test above.
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Gas')).not.toBeInTheDocument()
  })

  it('shows that same bill once the viewed month is the one it is due in', async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    await seedPendiente({
      db,
      householdId,
      categoryId,
      name: 'Gas',
      dayOfMonth: 10,
      expectedAmount: 1000,
    })

    renderSection(
      <Section db={db} householdId={householdId} onMarkPaid={vi.fn()} />,
    )

    expect(await screen.findByText('Gas')).toBeInTheDocument()
  })

  it("opens a card's Resumen to its cuotas, never the Pendiente form", async () => {
    const { db, householdId, categoryId } = await seedHousehold()
    const { month, heladeraDate } = await seedTwoCuotaResumen(
      db,
      householdId,
      categoryId,
    )
    const onMarkPaid = vi.fn()

    renderSection(
      <Section
        db={db}
        householdId={householdId}
        onMarkPaid={onMarkPaid}
        {...month}
      />,
    )

    const card = await screen.findByRole('button', {
      name: /^Ver Resumen Visa de /,
    })
    expect(card).toHaveTextContent('220')
    fireEvent.click(card)
    expect(onMarkPaid).not.toHaveBeenCalled()

    const cuotas = await screen.findByRole('list', {
      name: 'Cuotas del resumen',
    })
    const rows = within(cuotas).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    const heladera = rows.find((row) => row.textContent.includes('Heladera'))
    expect(heladera).toHaveTextContent('Comida')
    expect(heladera).toHaveTextContent(formatLongDate(heladeraDate))
    expect(heladera).toHaveTextContent('cuota 2/3')
    expect(heladera).toHaveTextContent('$100')
    const zapatillas = rows.find((row) =>
      row.textContent.includes('Zapatillas'),
    )
    expect(zapatillas).toHaveTextContent('$120')
    expect(zapatillas).not.toHaveTextContent('cuota')
  })
})

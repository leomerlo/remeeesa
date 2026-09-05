import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createHouseholdWithMembership } from '@/lib/households'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createPendiente, listPendientes } from '@/lib/pendientes'
import { currentMonthRange } from '@/lib/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { App, AppRoutes } from './App'

// One assertion that exercises the whole shell: the providers compose, the stub
// client injects, and the render helper works. It does not assert on Tailwind
// class names — that would test the implementation, break on every shadcn
// upgrade, and prove nothing about how the screen looks. Pill shape and
// monochrome are checked by eye against docs/design/design-reference.png.
describe('App', () => {
  it('renders the onboarding form through the provider tree', () => {
    renderWithProviders(<App currentUserId={null} />)

    expect(screen.getByRole('img', { name: 'remeeesa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre del hogar')).toBeInTheDocument()
    expect(screen.getByLabelText('Presupuesto mensual')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continuar' }),
    ).toBeInTheDocument()
  })

  it('renders signup-to-join at /join/:token', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/join/invite-token']}>
        <AppRoutes currentUserId={null} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('img', { name: 'remeeesa' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Crear cuenta' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del hogar')).not.toBeInTheDocument()
  })

  it('renders household editing at /household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/household']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    // The wordmark stays visible in the persistent app header, not just the
    // unauthenticated sign-up/log-in/join hero (AuthHero) -- it just isn't
    // the big hero treatment here.
    // Two wordmarks exist in the markup -- the phone's header bar and the
    // desktop sidebar's -- each `display: none` at the other's widths, so
    // exactly one is ever exposed. This asserts the header's.
    const header = await screen.findByRole('banner')
    expect(
      within(header).getByRole('img', { name: 'remeeesa' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
        'Casa Verde',
      )
    })
    expect(screen.getByLabelText('Presupuesto mensual')).toHaveValue('100')
    expect(
      await screen.findByRole('heading', { name: 'Integrantes' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generar link de invitación' }),
    ).toBeInTheDocument()
  })

  it('shows the nav for a signed-in user with a household and navigates to Ajustes', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
    expect(within(nav).getByRole('link', { name: /inicio/i })).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(within(nav).getByRole('link', { name: /ajustes/i }))

    expect(
      await screen.findByRole('heading', { name: 'Integrantes' }),
    ).toBeInTheDocument()
  })

  it('does not show the nav during onboarding or on /join/:token', async () => {
    renderWithProviders(<App currentUserId={null} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

    renderWithProviders(
      <MemoryRouter initialEntries={['/join/invite-token']}>
        <AppRoutes currentUserId={null} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it.each(['/historico', '/categorias'] as const)(
    'renders %s with no nav when there is no session',
    async (path) => {
      renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes currentUserId={null} />
        </MemoryRouter>,
      )

      expect(
        await screen.findByRole('heading', {
          name: path === '/historico' ? 'Histórico' : 'Categorías',
        }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    },
  )

  it.each(['/historico', '/categorias'] as const)(
    'renders %s with no nav for a signed-in user with no household',
    async (path) => {
      const db = createMemoryHouseholdsDb().asUser('user-1')

      renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes currentUserId="user-1" householdsDb={db} />
        </MemoryRouter>,
      )

      expect(
        await screen.findByRole('heading', {
          name: path === '/historico' ? 'Histórico' : 'Categorías',
        }),
      ).toBeInTheDocument()
      await waitFor(() => {
        expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      })
    },
  )

  it('renders /pendientes for a signed-in member, reachable from the nav', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/pendientes']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Servicios' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar Servicio' }),
    ).toBeInTheDocument()

    const nav = await screen.findByRole('navigation')
    const servicios = within(nav).getByRole('link', { name: /servicios/i })
    expect(servicios).toHaveAttribute('href', '/pendientes')
    expect(
      within(nav).queryByRole('link', { name: /pendientes/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the nav and marks Histórico active when navigating there directly', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/historico']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    // Wait for the nav (the final, settled render) before asserting on the
    // active-link state below, which only exists once the nav has mounted.
    const nav = await screen.findByRole('navigation')
    expect(
      screen.getByRole('heading', { name: 'Histórico' }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: /histórico/i }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('renders the persistent header outside <main>, not boxed into the page column', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    const header = await screen.findByRole('banner')
    const logo = within(header).getByRole('img', { name: 'remeeesa' })
    const main = document.querySelector('main')
    expect(main).not.toBeNull()
    expect(main?.contains(logo)).toBe(false)
  })

  // The app has no server, so this is what "it pays itself every month"
  // actually means: the bank already took the money on the due date, and the
  // next time anyone opens remeeesa the record catches up. See
  // features/pendientes/useSettleAutoDebits.
  describe('auto-debit bills', () => {
    async function seedAutoDebit(options: {
      readonly autoDebit: boolean
      readonly dueDate: Date
      readonly expectedAmount: number | null
    }) {
      const db = createMemoryHouseholdsDb().asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100000,
      })
      const categories = await listCategories({ db, householdId: household.id })
      const comida = categories.find((category) => category.name === 'Comida')
      if (comida === undefined) {
        throw new Error('expected seeded Comida category')
      }
      await createPendiente({
        db,
        householdId: household.id,
        categoryId: comida.id,
        name: 'Netflix',
        dueDate: options.dueDate,
        expectedAmount: options.expectedAmount,
        recurring: true,
        autoDebit: options.autoDebit,
      })
      return { db, householdId: household.id }
    }

    // Yesterday, so it is past due whatever day the suite runs on.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

    it('settles one whose date has passed, dated the day it was due', async () => {
      const { db, householdId } = await seedAutoDebit({
        autoDebit: true,
        dueDate: yesterday,
        expectedAmount: 5000,
      })

      renderWithProviders(
        <MemoryRouter initialEntries={['/pendientes']}>
          <AppRoutes currentUserId="user-1" householdsDb={db} />
        </MemoryRouter>,
      )

      await waitFor(async () => {
        expect(await listPendientes({ db, householdId })).toHaveLength(1)
      })
      // The cycle just settled is gone from the pending list; what is left is
      // the next one it spawned, a month out.
      const [next] = await listPendientes({ db, householdId })
      expect(next?.dueDate.getTime()).toBeGreaterThan(yesterday.getTime())
      expect(next?.autoDebit).toBe(true)

      const { monthStart, monthEnd } = currentMonthRange()
      const expenses = await listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      })
      const netflix = expenses.find((expense) => expense.name === 'Netflix')
      expect(netflix?.price).toBe(5000)
      // Dated the due date, not the day the app happened to be opened, so it
      // lands in the month it belongs to.
      expect(netflix?.expenseDate.getDate()).toBe(yesterday.getDate())
    })

    it('leaves a bill the household pays itself alone', async () => {
      const { db, householdId } = await seedAutoDebit({
        autoDebit: false,
        dueDate: yesterday,
        expectedAmount: 5000,
      })

      renderWithProviders(
        <MemoryRouter initialEntries={['/pendientes']}>
          <AppRoutes currentUserId="user-1" householdsDb={db} />
        </MemoryRouter>,
      )

      expect(await screen.findByText('Netflix')).toBeInTheDocument()
      const pending = await listPendientes({ db, householdId })
      expect(pending).toHaveLength(1)
      expect(pending[0]?.status).toBe('pending')
    })

    it('will not invent an amount for one that has none yet', async () => {
      const { db, householdId } = await seedAutoDebit({
        autoDebit: true,
        dueDate: yesterday,
        expectedAmount: null,
      })

      renderWithProviders(
        <MemoryRouter initialEntries={['/pendientes']}>
          <AppRoutes currentUserId="user-1" householdsDb={db} />
        </MemoryRouter>,
      )

      // Stays owed, wearing its badge, until someone fills the figure in.
      expect(await screen.findByText(/Débito automático/)).toBeInTheDocument()
      const pending = await listPendientes({ db, householdId })
      expect(pending).toHaveLength(1)
      expect(pending[0]?.status).toBe('pending')
    })
  })
})

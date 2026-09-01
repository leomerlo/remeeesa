import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { createHouseholdWithMembership } from '@/lib/households'
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

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
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

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
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

    // No "remeeesa" wordmark here -- that hero belongs to the unauthenticated
    // sign-up/log-in/join flow (AuthHero), not an authenticated screen like
    // Ajustes.
    //
    // Explicit timeout: this screen chains two awaited reads (getMembership,
    // then getHousehold) before it renders the form at all, so under the full
    // suite's parallel load the default 1s waitFor budget is occasionally
    // exceeded and the assertion lands while "Cargando…" is still showing.
    // Verified intermittent, not a regression: the file passes in isolation
    // and the full suite passes on re-run.
    await waitFor(
      () => {
        expect(screen.getByLabelText('Nombre del hogar')).toHaveValue(
          'Casa Verde',
        )
      },
      { timeout: 5000 },
    )
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
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
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

  it('renders /cuentas for a signed-in member with a household, unlinked from the nav', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/cuentas']}>
        <AppRoutes currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: 'Cuentas' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nueva cuenta' }),
    ).toBeInTheDocument()

    // /cuentas is intentionally unlinked from Home in this ticket -- the nav
    // must not grow a 5th entry pointing at it.
    const nav = await screen.findByRole('navigation')
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
    expect(
      within(nav).queryByRole('link', { name: /cuentas/i }),
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
})

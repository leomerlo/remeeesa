import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { AppFirebaseClient } from '@/lib/firebase'
import type { HouseholdsDb } from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AppShell } from './AppShell'
import type { AppShellProps } from './AppShell'

function renderShell(
  props: AppShellProps,
  options?: {
    readonly initialEntries?: readonly string[]
    readonly client?: AppFirebaseClient
  },
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[...(options?.initialEntries ?? ['/'])]}>
      <Routes>
        <Route element={<AppShell {...props} />}>
          <Route path="/" element={<p>Home content</p>} />
          <Route path="/historico" element={<p>Historico content</p>} />
          <Route path="/categorias" element={<p>Categorias content</p>} />
          <Route path="/household" element={<p>Household content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { client: options?.client },
  )
}

describe('AppShell', () => {
  it('renders only the outlet while resolving the session', () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        authStateReady: () => new Promise(() => {}),
        onAuthStateChanged: () => () => {},
      },
    })

    renderShell(
      { householdsDb: createMemoryHouseholdsDb().asUser('user-1') },
      { client },
    )

    expect(screen.getByText('Home content')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders only the outlet when signed out', () => {
    renderShell({ currentUserId: null })

    expect(screen.getByText('Home content')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('renders only the outlet when the signed-in user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderShell({ currentUserId: 'user-1', householdsDb: db })

    expect(await screen.findByText('Home content')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    })
  })

  it('shows the nav with all 4 links and marks Home active at /', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell({ currentUserId: 'user-1', householdsDb: db })

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: /inicio/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: /histórico/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: /categorías/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: /ajustes/i }),
    ).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
  })

  // Per direct feedback: Servicios is a top-level destination at every
  // width, between Histórico and Categorías.
  it('carries Servicios in the nav at every width', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell({ currentUserId: 'user-1', householdsDb: db })

    const nav = await screen.findByRole('navigation')
    const servicios = within(nav).getByRole('link', { name: /servicios/i })
    expect(servicios).toHaveAttribute('href', '/pendientes')
    // No entry is hidden at any width, and Servicios sits third.
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(labels).toEqual([
      'Inicio',
      'Histórico',
      'Servicios',
      'Categorías',
      'Ajustes',
    ])
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.closest('li')).not.toHaveClass('hidden')
    }
  })

  it('marks Ajustes active at /household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell(
      { currentUserId: 'user-1', householdsDb: db },
      { initialEntries: ['/household'] },
    )

    const nav = await screen.findByRole('navigation')
    expect(within(nav).getByRole('link', { name: /ajustes/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: /inicio/i }),
    ).not.toHaveAttribute('aria-current', 'page')
  })

  it('gives each nav link a 44px touch-target floor', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell({ currentUserId: 'user-1', householdsDb: db })

    const nav = await screen.findByRole('navigation')
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveClass('min-h-11')
      expect(link).toHaveClass('min-w-11')
    }
  })

  it('marks Histórico active at /historico and leaves the others inactive', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell(
      { currentUserId: 'user-1', householdsDb: db },
      { initialEntries: ['/historico'] },
    )

    const nav = await screen.findByRole('navigation')
    expect(
      within(nav).getByRole('link', { name: /histórico/i }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /inicio/i }),
    ).not.toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /categorías/i }),
    ).not.toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /ajustes/i }),
    ).not.toHaveAttribute('aria-current', 'page')
  })

  it('marks Categorías active at /categorias', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell(
      { currentUserId: 'user-1', householdsDb: db },
      { initialEntries: ['/categorias'] },
    )

    const nav = await screen.findByRole('navigation')
    expect(
      within(nav).getByRole('link', { name: /categorías/i }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /inicio/i }),
    ).not.toHaveAttribute('aria-current', 'page')
  })

  it('hides the nav when loading membership throws', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const throwingDb: HouseholdsDb = {
      ...db,
      getMembership: async () => {
        throw new Error('boom')
      },
    }

    renderShell({ currentUserId: 'user-1', householdsDb: throwingDb })

    expect(await screen.findByText('Home content')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    })
  })

  it('makes every nav link keyboard-reachable and activatable', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderShell({ currentUserId: 'user-1', householdsDb: db })

    const nav = await screen.findByRole('navigation')
    const ajustesLink = within(nav).getByRole('link', { name: /ajustes/i })
    // A real <a href> is Tab-reachable and Enter-activated by the browser
    // by default; asserting no tabIndex override keeps that contract intact
    // rather than re-implementing default anchor behavior in the test.
    expect(ajustesLink).not.toHaveAttribute('tabindex', '-1')
    ajustesLink.focus()
    expect(ajustesLink).toHaveFocus()

    fireEvent.click(ajustesLink)

    expect(await screen.findByText('Household content')).toBeInTheDocument()
  })

  it('preserves in-progress state in the routed page when the nav appears', async () => {
    // Regression test: AppShell used to return a bare `<Outlet/>` while
    // resolving membership, then switch to `<Outlet/>` nested inside a new
    // wrapper alongside the nav once resolved. Because Outlet's position in
    // the tree changed between renders, React couldn't reconcile it as the
    // same node and remounted the whole routed subtree, silently discarding
    // any local state -- e.g. a half-typed form -- the moment the nav popped
    // in. This test types into a stateful child before membership resolves
    // and asserts the value survives once the nav appears.
    function StatefulChild() {
      return <input aria-label="Draft note" defaultValue="" />
    }

    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            element={<AppShell currentUserId="user-1" householdsDb={db} />}
          >
            <Route path="/" element={<StatefulChild />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.change(screen.getByLabelText('Draft note'), {
      target: { value: 'buy milk' },
    })

    await screen.findByRole('navigation')

    expect(screen.getByLabelText('Draft note')).toHaveValue('buy milk')
  })

  it('renders nothing, including the nav, on a path with no matching route', async () => {
    // AppShell is nested as a pathless layout route: React Router only
    // renders a layout route when one of its children also matches, so an
    // unmatched path (no catch-all/404 route exists yet) drops the shell
    // entirely, taking the persistent nav down with it.
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const { container } = renderShell(
      { currentUserId: 'user-1', householdsDb: db },
      { initialEntries: ['/does-not-exist'] },
    )

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})

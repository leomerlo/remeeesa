import { screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { AppFirebaseClient } from '@/lib/firebase'
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
    expect(
      within(nav).getByRole('link', { name: /home/i }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /histórico/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: /categorías/i }),
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole('link', { name: /ajustes/i }),
    ).toBeInTheDocument()
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
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
    expect(
      within(nav).getByRole('link', { name: /ajustes/i }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav).getByRole('link', { name: /home/i }),
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
})

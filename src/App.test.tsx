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
    expect(screen.getByLabelText('Household name')).toBeInTheDocument()
    expect(screen.getByLabelText('Monthly budget')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
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
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument()
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

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByLabelText('Household name')).toHaveValue('Casa Verde')
    })
    expect(screen.getByLabelText('Monthly budget')).toHaveValue('100')
    expect(
      await screen.findByRole('heading', { name: 'Participants' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Generate invite link' }),
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
    expect(within(nav).getByRole('link', { name: /home/i })).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(within(nav).getByRole('link', { name: /ajustes/i }))

    expect(
      await screen.findByRole('heading', { name: 'Participants' }),
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

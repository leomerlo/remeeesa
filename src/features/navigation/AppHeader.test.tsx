import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AppHeader } from './AppHeader'

describe('AppHeader', () => {
  it('renders nothing when signed out', () => {
    const { container } = renderWithProviders(
      <AppHeader currentUserId={null} />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for a signed-in user with no household yet', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    const { container } = renderWithProviders(
      <AppHeader currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('shows the wordmark once a signed-in user has a household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<AppHeader currentUserId="user-1" householdsDb={db} />)

    expect(
      await screen.findByRole('img', { name: 'remeeesa' }),
    ).toBeInTheDocument()
  })
})

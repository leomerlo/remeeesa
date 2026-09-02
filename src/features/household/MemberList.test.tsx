import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MemberList } from './MemberList'

describe('MemberList', () => {
  it('lists the current member as You', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemberList db={db} householdId={household.id} currentUserId="user-1" />,
    )

    expect(await screen.findByText('Vos')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Integrantes' }),
    ).toBeInTheDocument()
  })

  // Without a name the avatar rendered "V" -- the first letter of a pronoun
  // rather than of anybody's name.
  it('shows the signed-in member by name, tagged as Vos', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <MemberList
        db={db}
        householdId={household.id}
        currentUserId="user-1"
        currentUserDisplayName="Florencia"
      />,
    )

    const row = (await screen.findByText('Florencia')).closest('li')
    expect(row).toHaveTextContent('Vos')
    // The avatar takes its initial from the real name now.
    expect(row?.firstElementChild).toHaveTextContent('F')
  })

  it('lists other members after You', async () => {
    const store = createMemoryHouseholdsDb()
    const db = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })

    renderWithProviders(
      <MemberList db={db} householdId={household.id} currentUserId="user-1" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Vos')).toBeInTheDocument()
      expect(screen.getByText('Miembro')).toBeInTheDocument()
    })

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Vos')
    expect(items[1]).toHaveTextContent('Miembro')
  })
})

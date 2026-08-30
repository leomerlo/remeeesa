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

    expect(await screen.findByText('You')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Participants' }),
    ).toBeInTheDocument()
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
      expect(screen.getByText('You')).toBeInTheDocument()
      expect(screen.getByText('Member')).toBeInTheDocument()
    })

    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('You')
    expect(items[1]).toHaveTextContent('Member')
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { Unirse } from './Unirse'
import type { BetaSession } from './data'

const FLOR = 'flor'
const LEO = 'leo'

// Somebody who was invited: signed in, no household of their own, and a
// code in hand.
describe('walking into a house with a code', () => {
  it('joins it, and the app opens on that household', async () => {
    const base = createMemoryHouseholdsDb()
    const hers = base.asUser(FLOR)
    const { household } = await hers.createHouseholdAndMembership({
      userId: FLOR,
      name: 'Casa Merlo',
      monthlyBudget: 500_000,
      displayName: 'Flor',
    })
    const invite = await hers.getOrCreateInvite({ householdId: household.id })

    const adopt = vi.fn()
    const forget = vi.fn()
    const session: BetaSession = {
      userId: LEO,
      householdId: null,
      displayName: null,
      db: base.asUser(LEO),
      adopt,
      rename: vi.fn(),
    }

    renderWithProviders(
      <Unirse session={session} token={invite.token} onForget={forget} />,
      {
        client: createFirebaseStub({
          auth: { currentUser: { uid: LEO, displayName: 'Leo', email: null } },
        } as never),
      },
    )

    fireEvent.click(screen.getByRole('button', { name: /Unirme al hogar/ }))

    await waitFor(() => {
      expect(adopt).toHaveBeenCalledWith(household.id)
    })
    // The code is spent, so it is dropped rather than left to be spent
    // again on the next reload.
    expect(forget).toHaveBeenCalled()
    const members = await hers.listMembers(household.id)
    expect(members.map((member) => member.displayName).sort()).toEqual([
      'Flor',
      'Leo',
    ])
  })

  it('says so when the code is no good, instead of a silent nothing', async () => {
    const base = createMemoryHouseholdsDb()
    const session: BetaSession = {
      userId: LEO,
      householdId: null,
      displayName: null,
      db: base.asUser(LEO),
      adopt: vi.fn(),
      rename: vi.fn(),
    }

    renderWithProviders(
      <Unirse session={session} token="no-existe" onForget={vi.fn()} />,
      {
        client: createFirebaseStub({
          auth: { currentUser: { uid: LEO, displayName: 'Leo', email: null } },
        } as never),
      },
    )

    fireEvent.click(screen.getByRole('button', { name: /Unirme al hogar/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese código no sirve',
    )
  })
})

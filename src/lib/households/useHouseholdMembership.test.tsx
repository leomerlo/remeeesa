import { fireEvent, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { createHouseholdWithMembership } from './households'
import type { HouseholdMember, HouseholdsDb } from './types'
import { useHouseholdMembership } from './useHouseholdMembership'

function membershipLabel(
  membership: HouseholdMember | null | undefined,
): string {
  if (membership === undefined) {
    return 'loading'
  }
  if (membership === null) {
    return 'none'
  }
  return membership.householdId
}

function HookHarness(props: {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}): ReactElement {
  const { currentUserId, membership } = useHouseholdMembership(props)
  return (
    <p data-testid="result">
      {`currentUserId:${String(currentUserId)} membership:${membershipLabel(membership)}`}
    </p>
  )
}

function SwitchUserHarness({
  db,
}: {
  readonly db: HouseholdsDb
}): ReactElement {
  const [userId, setUserId] = useState<'user-1' | 'user-2'>('user-1')
  const { membership } = useHouseholdMembership({
    currentUserId: userId,
    householdsDb: db,
  })
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUserId('user-2')
        }}
      >
        Switch user
      </button>
      <p data-testid="result">{membershipLabel(membership)}</p>
    </>
  )
}

describe('useHouseholdMembership', () => {
  it('resolves the membership for a signed-in member with a household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <HookHarness currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent(
        `membership:${household.id}`,
      )
    })
  })

  it('resolves membership as null for a signed-in user with no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderWithProviders(
      <HookHarness currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('membership:none')
    })
  })

  it('resolves membership as null when the membership lookup throws', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const db: HouseholdsDb = {
      ...base,
      getMembership: async () => {
        throw new Error('network error')
      },
    }

    renderWithProviders(
      <HookHarness currentUserId="user-1" householdsDb={db} />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('membership:none')
    })
  })

  it('resolves currentUserId from a live Firebase session when no prop is given', async () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: { uid: 'user-1' },
        authStateReady: () => Promise.resolve(),
        onAuthStateChanged: () => () => {},
      },
    })
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<HookHarness householdsDb={db} />, { client })

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent(
        'currentUserId:user-1',
      )
    })
  })

  it('resets membership to loading immediately when currentUserId changes, instead of leaving the previous household visible', async () => {
    let resolveSecondLookup: (member: HouseholdMember | null) => void = () => {}
    let callCount = 0
    const db: HouseholdsDb = {
      ...createMemoryHouseholdsDb().asUser('user-1'),
      getMembership: async () => {
        callCount += 1
        if (callCount === 1) {
          return {
            householdId: 'household-1',
            userId: 'user-1',
            joinedAt: new Date(),
            displayName: 'Ada',
          }
        }
        return new Promise((resolve) => {
          resolveSecondLookup = resolve
        })
      },
    }

    renderWithProviders(<SwitchUserHarness db={db} />)

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('household-1')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Switch user' }))

    // The second lookup is still in flight (its promise is held open above),
    // so the previous user's household must not still be shown.
    expect(screen.getByTestId('result')).toHaveTextContent('loading')

    resolveSecondLookup({
      householdId: 'household-2',
      userId: 'user-2',
      joinedAt: new Date(),
      displayName: 'Bob',
    })

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('household-2')
    })
  })
})

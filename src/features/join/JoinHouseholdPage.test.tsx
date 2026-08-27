import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AppFirebaseClient } from '@/lib/firebase'
import {
  createHouseholdWithMembership,
  getOrCreateHouseholdInvite,
  joinHousehold,
  listHouseholdMembers,
} from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { SignupAuth } from '@/features/onboarding/signupAuth'
import { JoinHouseholdPage } from './JoinHouseholdPage'
import type { JoinHouseholdPageProps } from './JoinHouseholdPage'

function signupAuthFor(userId: string): SignupAuth {
  return {
    signUpWithEmail: vi.fn(async () => ({ userId })),
    signUpWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function renderJoinPage(token: string, props: JoinHouseholdPageProps) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/join/${token}`]}>
      <Routes>
        <Route path="/join/:token" element={<JoinHouseholdPage {...props} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('JoinHouseholdPage', () => {
  it('auto-joins an authenticated visitor who has no household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')

    renderJoinPage(invite.token, {
      currentUserId: 'user-2',
      householdsDb: joinerDb,
    })

    expect(
      screen.queryByRole('button', { name: 'Create account' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continue with Google' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Join household' }),
    ).not.toBeInTheDocument()

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joined household',
    )

    await waitFor(async () => {
      await expect(
        listHouseholdMembers({ db: joinerDb, householdId: household.id }),
      ).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: 'user-2' })]),
      )
    })
  })

  it('auto-joins after a persisted session becomes ready', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    let emitAuth: ((user: { readonly uid: string } | null) => void) | undefined
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        onAuthStateChanged(
          next: (user: { readonly uid: string } | null) => void,
        ) {
          emitAuth = next
          return () => {
            emitAuth = undefined
          }
        },
      } as AppFirebaseClient['auth'],
    })

    renderWithProviders(
      <MemoryRouter initialEntries={[`/join/${invite.token}`]}>
        <Routes>
          <Route
            path="/join/:token"
            element={<JoinHouseholdPage householdsDb={joinerDb} />}
          />
        </Routes>
      </MemoryRouter>,
      { client },
    )

    expect(screen.getByText('Joining…')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Create account' }),
    ).not.toBeInTheDocument()

    emitAuth?.({ uid: 'user-2' })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joined household',
    )
    await expect(
      listHouseholdMembers({ db: joinerDb, householdId: household.id }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-2' })]),
    )
  })

  it('shows joined when the visitor is already in the invited household', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    await joinHousehold({
      db: joinerDb,
      userId: 'user-2',
      token: invite.token,
    })

    renderJoinPage(invite.token, {
      currentUserId: 'user-2',
      householdsDb: joinerDb,
    })

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joined household',
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const members = await listHouseholdMembers({
      db: joinerDb,
      householdId: household.id,
    })
    expect(members.filter((member) => member.userId === 'user-2')).toHaveLength(
      1,
    )
  })

  it('signs an anonymous visitor up then auto-joins with no confirm step', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    const signupAuth = signupAuthFor('user-2')

    renderJoinPage(invite.token, {
      currentUserId: null,
      householdsDb: joinerDb,
      signupAuth,
    })

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Join household' }),
    ).not.toBeInTheDocument()
    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([expect.objectContaining({ userId: 'user-1' })])

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joined household',
    )
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret12',
    })
    await expect(
      listHouseholdMembers({ db: joinerDb, householdId: household.id }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-2' })]),
    )
  })

  it('auto-joins after Google signup with no confirm step', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    const signupAuth = signupAuthFor('user-2')

    renderJoinPage(invite.token, {
      currentUserId: null,
      householdsDb: joinerDb,
      signupAuth,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Joined household',
    )
    expect(signupAuth.signUpWithGoogle).toHaveBeenCalledOnce()
    await expect(
      listHouseholdMembers({ db: joinerDb, householdId: household.id }),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ userId: 'user-2' })]),
    )
  })

  it('shows a generic error for an invalid token and does not join', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const bogusToken = 'missing-token'
    const joinerDb = store.asUser('user-2')

    renderJoinPage(bogusToken, {
      currentUserId: 'user-2',
      householdsDb: joinerDb,
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not join household')
    expect(alert).not.toHaveTextContent(bogusToken)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([expect.objectContaining({ userId: 'user-1' })])
  })

  it('shows a generic error after signup when the token is invalid', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const bogusToken = 'missing-token'
    const joinerDb = store.asUser('user-2')
    const signupAuth = signupAuthFor('user-2')

    renderJoinPage(bogusToken, {
      currentUserId: null,
      householdsDb: joinerDb,
      signupAuth,
    })

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not join household')
    expect(alert).not.toHaveTextContent(bogusToken)
    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([expect.objectContaining({ userId: 'user-1' })])
  })

  it('does not join when email signup fails', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(async () => {
        throw new Error('email already in use')
      }),
      signUpWithGoogle: vi.fn(async () => ({ userId: 'user-2' })),
    }

    renderJoinPage(invite.token, {
      currentUserId: null,
      householdsDb: joinerDb,
      signupAuth,
    })

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create account',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(signupAuth.signUpWithGoogle).not.toHaveBeenCalled()
    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([expect.objectContaining({ userId: 'user-1' })])
  })

  it('does not join when Google signup fails', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const invite = await getOrCreateHouseholdInvite({
      db: ownerDb,
      householdId: household.id,
    })
    const joinerDb = store.asUser('user-2')
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(async () => ({ userId: 'user-2' })),
      signUpWithGoogle: vi.fn(async () => {
        throw new Error('popup closed')
      }),
    }

    renderJoinPage(invite.token, {
      currentUserId: null,
      householdsDb: joinerDb,
      signupAuth,
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not create account',
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    await expect(
      listHouseholdMembers({ db: ownerDb, householdId: household.id }),
    ).resolves.toEqual([expect.objectContaining({ userId: 'user-1' })])
  })
})

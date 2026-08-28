import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HouseholdDraftProvider } from '@/features/onboarding'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { SignupAuth } from '@/features/onboarding/signupAuth'
import { HomePage } from './HomePage'

function signupAuthFor(userId: string): SignupAuth {
  return {
    signUpWithEmail: vi.fn(async () => ({ userId })),
    signUpWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function renderHome(ui: ReactElement) {
  return renderWithProviders(
    <HouseholdDraftProvider>{ui}</HouseholdDraftProvider>,
  )
}

describe('HomePage', () => {
  it('shows onboarding when there is no session', () => {
    renderHome(<HomePage currentUserId={null} />)

    expect(screen.getByLabelText('Household name')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Generate invite link' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: /remaining budget/i }),
    ).not.toBeInTheDocument()
  })

  it('shows onboarding when the signed-in user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByLabelText('Household name')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Generate invite link' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('status', { name: /remaining budget/i }),
    ).not.toBeInTheDocument()
  })

  it('shows the household and invite panel when the user already belongs', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Casa Verde')).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: /remaining budget/i }),
    ).toHaveTextContent('100')
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    expect(await screen.findByLabelText('Invite link')).toBeInTheDocument()
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument()
  })

  it('shows the invite panel after signup creates the household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth = signupAuthFor('user-1')

    renderHome(
      <HomePage
        currentUserId="user-1"
        householdsDb={db}
        signupAuth={signupAuth}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Household name'), {
      target: { value: 'Casa Verde' },
    })
    fireEvent.change(screen.getByLabelText('Monthly budget'), {
      target: { value: '100' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Casa Verde')).toBeInTheDocument()
    expect(
      await screen.findByRole('status', { name: /remaining budget/i }),
    ).toHaveTextContent('100')
    expect(
      screen.getByRole('button', { name: 'Generate invite link' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(signupAuth.signUpWithEmail).toHaveBeenCalled()
    })
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  AlreadyInHouseholdError,
  createHouseholdWithMembership,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  HouseholdDraftProvider,
  useHouseholdDraft,
} from './HouseholdDraftContext'
import { OnboardingForm } from './OnboardingForm'
import type { OnboardingFormProps } from './OnboardingForm'
import type { SignupAuth } from './signupAuth'

function DraftStatus(): ReactElement {
  const { draft } = useHouseholdDraft()
  if (draft === null) {
    return <p>No household draft</p>
  }

  return (
    <p>{`Household draft: ${draft.name}, ${String(draft.monthlyBudget)}`}</p>
  )
}

function renderOnboarding(props: OnboardingFormProps = {}) {
  return renderWithProviders(
    <HouseholdDraftProvider>
      <OnboardingForm {...props} />
      <DraftStatus />
    </HouseholdDraftProvider>,
  )
}

function signupAuthFor(userId: string): SignupAuth {
  return {
    signUpWithEmail: vi.fn(async () => ({ userId })),
    signUpWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function submitOnboarding(fields: {
  readonly name?: string
  readonly monthlyBudget?: string
}): void {
  if (fields.name !== undefined) {
    fireEvent.change(screen.getByLabelText('Household name'), {
      target: { value: fields.name },
    })
  }
  if (fields.monthlyBudget !== undefined) {
    fireEvent.change(screen.getByLabelText('Monthly budget'), {
      target: { value: fields.monthlyBudget },
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('OnboardingForm', () => {
  it('stores a household draft when name and budget are valid', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
  })

  it('rejects an empty household name and does not store a draft', () => {
    renderOnboarding()
    submitOnboarding({ monthlyBudget: '1500' })

    expect(screen.getByRole('alert')).toHaveTextContent(/household name/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a household name that is only whitespace', () => {
    renderOnboarding()
    submitOnboarding({ name: '   ', monthlyBudget: '1500' })

    expect(screen.getByRole('alert')).toHaveTextContent(/household name/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a monthly budget that is not greater than zero', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '0' })

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a negative monthly budget', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '-12' })

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a non-numeric monthly budget', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: 'abc' })

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('stores a draft when the monthly budget has decimals', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1200.50' })

    expect(
      screen.getByText('Household draft: The Smiths, 1200.5'),
    ).toBeInTheDocument()
  })

  it('trims surrounding whitespace from the stored household name', () => {
    renderOnboarding()
    submitOnboarding({ name: '  The Smiths  ', monthlyBudget: '1500' })

    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
  })

  it('rejects an empty monthly budget and does not store a draft', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths' })

    expect(screen.getByRole('alert')).toHaveTextContent(/budget/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('clears the error after a subsequent valid submit', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '0' })

    expect(screen.getByRole('alert')).toBeInTheDocument()

    submitOnboarding({ monthlyBudget: '1500' })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
  })

  it('shows email and Google signup after a valid household draft is saved', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
  })

  it('creates the household from the draft after email signup and clears the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => {
      expect(screen.getByText('No household draft')).toBeInTheDocument()
    })
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret12',
    })
    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Should not create',
        monthlyBudget: 1,
      }),
    ).rejects.toThrow(AlreadyInHouseholdError)
  })

  it('creates the household from the draft after Google signup and clears the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    )

    await waitFor(() => {
      expect(screen.getByText('No household draft')).toBeInTheDocument()
    })
    expect(signupAuth.signUpWithGoogle).toHaveBeenCalledOnce()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Should not create',
        monthlyBudget: 1,
      }),
    ).rejects.toThrow(AlreadyInHouseholdError)
  })

  it('does not create a household when signup auth fails and keeps the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(async () => {
        throw new Error('email already in use')
      }),
      signUpWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

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
    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Later house',
        monthlyBudget: 100,
      }),
    ).resolves.toMatchObject({ name: 'Later house' })
  })

  it('does not clear the draft when household create fails after auth', async () => {
    const signupAuth = signupAuthFor('user-1')
    const db = {
      ...createMemoryHouseholdsDb().asUser('user-1'),
      createHouseholdAndMembership: async () => {
        throw new Error('unavailable')
      },
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret12' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save household',
    )
    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('discards the draft when onboarding unmounts', () => {
    const { unmount } = renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()

    unmount()
    renderOnboarding()

    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })
})

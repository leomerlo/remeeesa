import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { HouseholdDraft } from './householdDraft'
import {
  HouseholdDraftProvider,
  useHouseholdDraft,
} from './HouseholdDraftContext'
import { SignupForm } from './SignupForm'
import type { SignupFormProps } from './SignupForm'
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

function SeedDraft({
  draft,
}: {
  readonly draft: HouseholdDraft
}): ReactElement {
  const { saveDraft } = useHouseholdDraft()
  return (
    <button type="button" onClick={() => saveDraft(draft)}>
      Seed draft
    </button>
  )
}

function signupAuthFor(userId: string): SignupAuth {
  return {
    signUpWithEmail: vi.fn(async () => ({ userId })),
    signUpWithGoogle: vi.fn(async () => ({ userId })),
    signInWithEmail: vi.fn(async () => ({ userId })),
    signInWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function householdsDbWithCreateSpy(userId: string): {
  readonly db: HouseholdsDb
  readonly createHouseholdAndMembership: HouseholdsDb['createHouseholdAndMembership']
} {
  const base = createMemoryHouseholdsDb().asUser(userId)
  const createHouseholdAndMembership = vi.fn(base.createHouseholdAndMembership)
  return {
    db: { ...base, createHouseholdAndMembership },
    createHouseholdAndMembership,
  }
}

function renderSignup(
  props: SignupFormProps = {},
  draft: HouseholdDraft | null = { name: 'The Smiths', monthlyBudget: 1500 },
) {
  const view = renderWithProviders(
    <HouseholdDraftProvider>
      {draft !== null ? <SeedDraft draft={draft} /> : null}
      <SignupForm {...props} />
      <DraftStatus />
    </HouseholdDraftProvider>,
  )
  if (draft !== null) {
    fireEvent.click(screen.getByRole('button', { name: 'Seed draft' }))
  }
  return view
}

function submitEmailSignup(): void {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'ada@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'secret12' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
}

describe('SignupForm', () => {
  it('does not write a household when there is no draft', async () => {
    const { db, createHouseholdAndMembership } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    const onFinished = vi.fn()
    renderSignup({ householdsDb: db, signupAuth, onFinished }, null)
    submitEmailSignup()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el hogar',
    )
    expect(createHouseholdAndMembership).not.toHaveBeenCalled()
    expect(onFinished).not.toHaveBeenCalled()
    expect(screen.getByText('No household draft')).toBeInTheDocument()
    await expect(
      createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Later house',
        monthlyBudget: 100,
      }),
    ).resolves.toMatchObject({ name: 'Later house' })
  })

  it('does not write again after success clears the draft', async () => {
    const { db, createHouseholdAndMembership } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    const onFinished = vi.fn()
    renderSignup({ householdsDb: db, signupAuth, onFinished })
    submitEmailSignup()

    await waitFor(() => {
      expect(screen.getByText('No household draft')).toBeInTheDocument()
    })
    expect(onFinished).toHaveBeenCalledOnce()
    expect(createHouseholdAndMembership).toHaveBeenCalledTimes(1)
    expect(createHouseholdAndMembership).toHaveBeenCalledWith({
      userId: 'user-1',
      name: 'The Smiths',
      monthlyBudget: 1500,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el hogar',
    )
    expect(createHouseholdAndMembership).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledOnce()
  })

  // The escape hatch that used to be missing: mode="login" is reached
  // automatically for a returning visitor (hasReturningUser()), so a wrong
  // guess -- a shared computer, a second household member's first sign-in on
  // this device -- had no way back to account creation short of a reload.
  it('offers a way back to signup from login mode, but not from signup mode', () => {
    const onNoAccount = vi.fn()
    renderSignup({ mode: 'login', onNoAccount }, null)

    fireEvent.click(screen.getByRole('button', { name: 'No tengo una cuenta' }))
    expect(onNoAccount).toHaveBeenCalledOnce()
  })

  it('does not offer "No tengo una cuenta" in signup mode', () => {
    renderSignup({ onNoAccount: vi.fn() }, null)

    expect(
      screen.queryByRole('button', { name: 'No tengo una cuenta' }),
    ).not.toBeInTheDocument()
  })

  it('does not offer "Ya tengo una cuenta" in login mode', () => {
    renderSignup({ mode: 'login', onAlreadyHaveAccount: vi.fn() }, null)

    expect(
      screen.queryByRole('button', { name: 'Ya tengo una cuenta' }),
    ).not.toBeInTheDocument()
  })
})

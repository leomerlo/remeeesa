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
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'secret12' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
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
      'Could not save household',
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

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save household',
    )
    expect(createHouseholdAndMembership).toHaveBeenCalledTimes(1)
    expect(onFinished).toHaveBeenCalledOnce()
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  HouseholdDraftProvider,
  useHouseholdDraft,
} from './HouseholdDraftContext'
import { OnboardingForm } from './OnboardingForm'
import type { OnboardingFormProps } from './OnboardingForm'
import { markReturningUser } from './returningUserStorage'
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
    signInWithEmail: vi.fn(async () => ({ userId })),
    signInWithGoogle: vi.fn(async () => ({ userId })),
  }
}

function householdsDbWithCreateSpy(userId: string): {
  readonly db: HouseholdsDb
  readonly createHouseholdAndMembership: HouseholdsDb['createHouseholdAndMembership']
  readonly writes: Array<
    Awaited<ReturnType<HouseholdsDb['createHouseholdAndMembership']>>
  >
} {
  const base = createMemoryHouseholdsDb().asUser(userId)
  const writes: Array<
    Awaited<ReturnType<HouseholdsDb['createHouseholdAndMembership']>>
  > = []
  const createHouseholdAndMembership = vi.fn(async (input) => {
    const result = await base.createHouseholdAndMembership(input)
    writes.push(result)
    return result
  })
  return {
    db: { ...base, createHouseholdAndMembership },
    createHouseholdAndMembership,
    writes,
  }
}

function submitOnboarding(fields: {
  readonly name?: string
  readonly monthlyBudget?: string
}): void {
  if (fields.name !== undefined) {
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), {
      target: { value: fields.name },
    })
  }
  if (fields.monthlyBudget !== undefined) {
    fireEvent.change(screen.getByLabelText('Presupuesto mensual'), {
      target: { value: fields.monthlyBudget },
    })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}

function submitEmailLogin(): void {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'ada@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Contraseña'), {
    target: { value: 'secret12' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
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

function expectDraftFieldsWritten(input: {
  readonly createHouseholdAndMembership: HouseholdsDb['createHouseholdAndMembership']
  readonly writes: Array<
    Awaited<ReturnType<HouseholdsDb['createHouseholdAndMembership']>>
  >
  readonly userId: string
  readonly name: string
  readonly monthlyBudget: number
}): void {
  expect(input.createHouseholdAndMembership).toHaveBeenCalledTimes(1)
  expect(input.createHouseholdAndMembership).toHaveBeenCalledWith({
    userId: input.userId,
    name: input.name,
    monthlyBudget: input.monthlyBudget,
  })
  expect(input.writes).toHaveLength(1)
  const written = input.writes[0]
  if (written === undefined) {
    throw new Error('expected a household write')
  }
  expect(written.member).toEqual({
    householdId: written.household.id,
    userId: input.userId,
    joinedAt: expect.any(Date),
  })
}

describe('OnboardingForm', () => {
  it('shows sign in instead of the household wizard for returning users', () => {
    markReturningUser()
    renderOnboarding()

    expect(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del hogar')).not.toBeInTheDocument()
  })

  it('renders a decorative illustration alongside the household-creation form', () => {
    const { container } = renderOnboarding()

    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeNull()
  })

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

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a household name that is only whitespace', () => {
    renderOnboarding()
    submitOnboarding({ name: '   ', monthlyBudget: '1500' })

    expect(screen.getByRole('alert')).toHaveTextContent(/nombre/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a monthly budget that is not greater than zero', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '0' })

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a negative monthly budget', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '-12' })

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
    expect(screen.getByText('No household draft')).toBeInTheDocument()
  })

  it('rejects a non-numeric monthly budget', () => {
    renderOnboarding()
    submitOnboarding({ name: 'The Smiths', monthlyBudget: 'abc' })

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
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

    expect(screen.getByRole('alert')).toHaveTextContent(/presupuesto/i)
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
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Crear cuenta' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continuar con Google' }),
    ).toBeInTheDocument()
  })

  it('creates the household from the draft after email signup and clears the draft', async () => {
    const { db, createHouseholdAndMembership, writes } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })
    submitEmailSignup()

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Hogar guardado')
    })
    expect(localStorage.getItem('remeeesa.returning_user')).toBe('1')
    expect(screen.getByText('No household draft')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Crear cuenta' }),
    ).not.toBeInTheDocument()
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret12',
    })
    expect(signupAuth.signUpWithGoogle).not.toHaveBeenCalled()
    expectDraftFieldsWritten({
      createHouseholdAndMembership,
      writes,
      userId: 'user-1',
      name: 'The Smiths',
      monthlyBudget: 1500,
    })
  })

  it('creates the household from the draft after Google signup and clears the draft', async () => {
    const { db, createHouseholdAndMembership, writes } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    fireEvent.click(
      screen.getByRole('button', { name: 'Continuar con Google' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Hogar guardado')
    })
    expect(screen.getByText('No household draft')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Continuar con Google' }),
    ).not.toBeInTheDocument()
    expect(signupAuth.signUpWithGoogle).toHaveBeenCalledOnce()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    expectDraftFieldsWritten({
      createHouseholdAndMembership,
      writes,
      userId: 'user-1',
      name: 'The Smiths',
      monthlyBudget: 1500,
    })
  })

  it('does not create a household when signup is shown but never submitted', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    expect(
      screen.getByRole('button', { name: 'Crear cuenta' }),
    ).toBeInTheDocument()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    expect(signupAuth.signUpWithGoogle).not.toHaveBeenCalled()
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

  it('does not create a household when signup auth fails and keeps the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(async () => {
        throw new Error('email already in use')
      }),
      signUpWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithEmail: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })
    submitEmailSignup()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la cuenta',
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

  it('does not create a household when Google signup fails and keeps the draft', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(async () => ({ userId: 'user-1' })),
      signUpWithGoogle: vi.fn(async () => {
        throw new Error('popup closed')
      }),
      signInWithEmail: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })

    fireEvent.click(
      screen.getByRole('button', { name: 'Continuar con Google' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la cuenta',
    )
    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
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
    submitEmailSignup()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el hogar',
    )
    expect(
      screen.getByText('Household draft: The Smiths, 1500'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('retries household create without signing up the email again', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    let createCalls = 0
    const db: HouseholdsDb = {
      ...base,
      createHouseholdAndMembership: async (input) => {
        createCalls += 1
        if (createCalls === 1) {
          throw new Error('unavailable')
        }
        return base.createHouseholdAndMembership(input)
      },
    }
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi
        .fn()
        .mockResolvedValueOnce({ userId: 'user-1' })
        .mockRejectedValue(new Error('email already in use')),
      signUpWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithEmail: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })
    submitEmailSignup()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar el hogar',
    )
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Hogar guardado',
    )
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledOnce()
    expect(screen.getByText('No household draft')).toBeInTheDocument()
    expect(createCalls).toBe(2)
  })

  it('disables email and Google signup while a request is in flight', async () => {
    const { db } = householdsDbWithCreateSpy('user-1')
    let resolveEmail!: (value: { readonly userId: string }) => void
    const signupAuth: SignupAuth = {
      signUpWithEmail: vi.fn(
        () =>
          new Promise<{ readonly userId: string }>((resolve) => {
            resolveEmail = resolve
          }),
      ),
      signUpWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithEmail: vi.fn(async () => ({ userId: 'user-1' })),
      signInWithGoogle: vi.fn(async () => ({ userId: 'user-1' })),
    }
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })
    submitEmailSignup()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Crear cuenta' }),
      ).toBeDisabled()
    })
    expect(
      screen.getByRole('button', { name: 'Continuar con Google' }),
    ).toBeDisabled()
    expect(signupAuth.signUpWithEmail).toHaveBeenCalledOnce()
    expect(signupAuth.signUpWithGoogle).not.toHaveBeenCalled()

    resolveEmail({ userId: 'user-1' })

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Hogar guardado')
    })
  })

  it('shows sign in after clicking I already have an account on the household step', () => {
    renderOnboarding()
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo una cuenta' }))

    expect(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre del hogar')).not.toBeInTheDocument()
  })

  it('signs in without creating a household when there is no draft', async () => {
    const { db, createHouseholdAndMembership } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    const onFinished = vi.fn()
    renderOnboarding({ householdsDb: db, signupAuth, onFinished })
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo una cuenta' }))
    submitEmailLogin()

    await waitFor(() => {
      expect(signupAuth.signInWithEmail).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'secret12',
      })
    })
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    expect(createHouseholdAndMembership).not.toHaveBeenCalled()
    expect(onFinished).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Nombre del hogar')).toBeInTheDocument()
  })

  it('creates the household from the draft after signing in on the signup step', async () => {
    const { db, createHouseholdAndMembership, writes } =
      householdsDbWithCreateSpy('user-1')
    const signupAuth = signupAuthFor('user-1')
    renderOnboarding({ householdsDb: db, signupAuth })
    submitOnboarding({ name: 'The Smiths', monthlyBudget: '1500' })
    fireEvent.click(screen.getByRole('button', { name: 'Ya tengo una cuenta' }))
    submitEmailLogin()

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Hogar guardado')
    })
    expect(signupAuth.signInWithEmail).toHaveBeenCalledOnce()
    expect(signupAuth.signUpWithEmail).not.toHaveBeenCalled()
    expectDraftFieldsWritten({
      createHouseholdAndMembership,
      writes,
      userId: 'user-1',
      name: 'The Smiths',
      monthlyBudget: 1500,
    })
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

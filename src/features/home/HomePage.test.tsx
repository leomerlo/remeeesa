import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { HouseholdDraftProvider } from '@/features/onboarding'
import { listExpensesInMonth } from '@/lib/expenses'
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

function currentMonthRange(now = new Date()): {
  readonly monthStart: Date
  readonly monthEnd: Date
} {
  return {
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    monthEnd: new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    ),
  }
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
    expect(
      screen.queryByRole('button', { name: 'Add expense' }),
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
    expect(
      screen.queryByRole('button', { name: 'Add expense' }),
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
    expect(await screen.findByText('No expenses this month')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    expect(await screen.findByLabelText('Invite link')).toBeInTheDocument()
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add expense' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Price')).toBeInTheDocument()
    expect(screen.getByLabelText('Category')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.queryByLabelText(/author/i)).not.toBeInTheDocument()
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
    expect(
      screen.getByRole('button', { name: 'Add expense' }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(signupAuth.signUpWithEmail).toHaveBeenCalled()
    })
  })

  it('attributes a submitted expense using the authorDisplayName prop', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(
      <HomePage
        currentUserId="user-1"
        householdsDb={db}
        authorDisplayName="Ada"
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Price'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          memberId: 'user-1',
          authorDisplayName: 'Ada',
          name: 'Pizza',
        }),
      ])
    })
  })

  it('attributes a submitted expense to the signed-in member with a Member display name', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderHome(<HomePage currentUserId="user-1" householdsDb={db} />)

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Pizza' },
    })
    fireEvent.change(screen.getByLabelText('Price'), {
      target: { value: '10' },
    })
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }))

    await waitFor(async () => {
      const listed = await listExpensesInMonth({
        db,
        householdId: household.id,
        ...currentMonthRange(),
      })
      expect(listed).toEqual([
        expect.objectContaining({
          memberId: 'user-1',
          authorDisplayName: 'Member',
          name: 'Pizza',
          price: 10,
        }),
      ])
    })
  })
})

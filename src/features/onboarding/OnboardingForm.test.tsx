import { fireEvent, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  HouseholdDraftProvider,
  useHouseholdDraft,
} from './HouseholdDraftContext'
import { OnboardingForm } from './OnboardingForm'

function DraftStatus(): ReactElement {
  const { draft } = useHouseholdDraft()
  if (draft === null) {
    return <p>No household draft</p>
  }

  return (
    <p>{`Household draft: ${draft.name}, ${String(draft.monthlyBudget)}`}</p>
  )
}

function renderOnboarding() {
  return renderWithProviders(
    <HouseholdDraftProvider>
      <OnboardingForm />
      <DraftStatus />
    </HouseholdDraftProvider>,
  )
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

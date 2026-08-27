import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { renderWithProviders } from '@/test/renderWithProviders'
import { App, AppRoutes } from './App'

// One assertion that exercises the whole shell: the providers compose, the stub
// client injects, and the render helper works. It does not assert on Tailwind
// class names — that would test the implementation, break on every shadcn
// upgrade, and prove nothing about how the screen looks. Pill shape and
// monochrome are checked by eye against docs/design/design-reference.png.
describe('App', () => {
  it('renders the onboarding form through the provider tree', () => {
    renderWithProviders(<App />)

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Household name')).toBeInTheDocument()
    expect(screen.getByLabelText('Monthly budget')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  })

  it('renders signup-to-join at /join/:token', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/join/invite-token']}>
        <AppRoutes currentUserId={null} />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create account' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Household name')).not.toBeInTheDocument()
  })
})

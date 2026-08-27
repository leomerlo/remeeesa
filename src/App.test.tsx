import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { App } from './App'

// One assertion that exercises the whole shell: the providers compose, the stub
// client injects, and the render helper works. It does not assert on Tailwind
// class names — that would test the implementation, break on every shadcn
// upgrade, and prove nothing about how the screen looks. Pill shape and
// monochrome are checked by eye against docs/design/design-reference.png.
describe('App', () => {
  it('renders its controls through the provider tree', () => {
    renderWithProviders(<App />)

    expect(
      screen.getByRole('heading', { name: 'remeeesa' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'this month' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add expense' }),
    ).toBeInTheDocument()
  })
})

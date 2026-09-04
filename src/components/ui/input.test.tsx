import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'

// This project's convention is to avoid asserting on styling classes. This
// file is a deliberate, narrow exception: touch-target size is a PRODUCT.md
// accessibility invariant (44x44 minimum), not decorative styling, so
// asserting the size token here is testing a requirement, not cosmetics.
// h-12 (48px) clears that floor with room to spare -- checked as an exact
// class rather than a computed-size assertion since jsdom has no layout
// engine to measure against.
describe('Input', () => {
  it('meets the 44px touch-target floor', () => {
    render(<Input aria-label="Household name" />)
    expect(screen.getByRole('textbox', { name: 'Household name' })).toHaveClass(
      'h-12',
    )
  })
})

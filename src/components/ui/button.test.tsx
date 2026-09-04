import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

// This project's convention is to avoid asserting on styling classes. This
// file is a deliberate, narrow exception: touch-target size is a PRODUCT.md
// accessibility invariant (44x44 minimum), not decorative styling, so
// asserting the size token here is testing a requirement, not cosmetics.
describe('Button size variants', () => {
  it.each([
    ['default', 'h-11'],
    ['xs', 'h-11'],
    ['sm', 'h-11'],
    ['lg', 'h-11'],
    ['icon', 'size-11'],
    ['icon-xs', 'size-11'],
    ['icon-sm', 'size-11'],
    ['icon-lg', 'size-12'],
  ] as const)('size="%s" meets the 44px touch-target floor', (size, token) => {
    render(<Button size={size}>Label</Button>)
    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(token)
  })

  it('carries the touch-target floor onto the composed element with asChild', () => {
    // Production usage (HomePage, EditHouseholdPage) wraps a <Link> in
    // asChild rather than rendering a <button>. The size class must reach
    // that element too, or the invariant silently fails for every
    // button-styled link in the app.
    render(
      <Button asChild>
        <a href="/household">Edit household</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Edit household' })).toHaveClass(
      'h-11',
    )
  })
})

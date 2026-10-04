import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

// This project's convention is to avoid asserting on styling classes. This
// file is a deliberate, narrow exception: control sizing is a PRODUCT.md
// accessibility invariant, not decorative styling, so asserting the size
// tokens here is testing a requirement.
//
// The invariant changed. Every size used to set h-11 (44px). Heights are
// gone: a text button is as tall as its padding makes it, which is 36px on
// a phone -- above WCAG 2.2's 24px target minimum, below the 44px a thumb
// is usually given, and chosen on purpose because a row of 44px buttons
// read as oversized beside everything around it. What stayed at 44 is the
// icon-only controls, which are exactly the ones with no label to aim at.
describe('Button size variants', () => {
  it.each([['default'], ['xs'], ['sm'], ['lg']] as const)(
    'size="%s" is sized by its padding, with no fixed height',
    (size) => {
      render(<Button size={size}>Label</Button>)

      const button = screen.getByRole('button', { name: 'Label' })
      // 18px either side on every size and every variant, with an icon or
      // without -- the icon-adjusted paddings this replaced left a button
      // with an icon visibly tighter than its neighbour without one.
      expect(button).toHaveClass('px-4.5')
      expect(button.className).not.toMatch(/\bh-\d/)
    },
  )

  it.each([
    ['icon', 'size-11'],
    ['icon-lg', 'size-12'],
  ] as const)('size="%s" keeps the 44px touch target', (size, token) => {
    render(<Button size={size}>Label</Button>)

    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(token)
  })

  it('carries its size onto the composed element with asChild', () => {
    // Production usage wraps a <Link> in asChild rather than rendering a
    // <button>. The size class must reach that element too, or the
    // invariant silently fails for every button-styled link in the app.
    render(
      <Button asChild>
        <a href="/household">Edit household</a>
      </Button>,
    )

    expect(screen.getByRole('link', { name: 'Edit household' })).toHaveClass(
      'px-4.5',
    )
  })
})

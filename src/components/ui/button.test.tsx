import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

// This project's convention is to avoid asserting on styling classes. This
// file is a deliberate, narrow exception: control sizing is a PRODUCT.md
// accessibility invariant, not decorative styling, so asserting the size
// tokens here is testing a requirement.
//
// The invariant: 46px tall, at every width. It is a floor, not a height --
// padding still decides, and a button whose content needs more simply gets
// taller. Well clear of WCAG 2.2's 24px target minimum. The sizes used to
// drop a step from `lg`, on the theory that a pointer needs less reach than
// a thumb; per direct feedback the bigger one is the one that looks right,
// so it is now the only one.
describe('Button size variants', () => {
  it.each([['default'], ['xs'], ['sm'], ['lg']] as const)(
    'size="%s" is 46px tall at every width',
    (size) => {
      render(<Button size={size}>Label</Button>)

      const button = screen.getByRole('button', { name: 'Label' })
      expect(button).toHaveClass('min-h-[46px]')
      // 18px either side on every size and every variant, with an icon or
      // without -- the icon-adjusted paddings this replaced left a button
      // with an icon visibly tighter than its neighbour without one.
      expect(button).toHaveClass('px-4.5')
      // A floor, not a height: nothing pins it, so a two-line label
      // grows. Anchored to a class boundary so `min-h-0` does not read as
      // one.
      expect(button.className).not.toMatch(/(?:^|\s)h-\d/)
    },
  )

  it.each([['icon'], ['icon-xs'], ['icon-sm'], ['icon-lg']] as const)(
    'size="%s" is a 46px square at every width',
    (size) => {
      render(<Button size={size}>Label</Button>)

      expect(screen.getByRole('button', { name: 'Label' })).toHaveClass(
        'size-[46px]',
      )
    },
  )

  // The one exception: the icon buttons that are only ever chrome -- a
  // carousel's arrows, the month pager's -- sit beside a line of text
  // rather than in a row of actions, and at 46px they dwarfed it.
  it('keeps the chrome icon buttons at 36px', () => {
    render(<Button size="icon-mini">Label</Button>)

    expect(screen.getByRole('button', { name: 'Label' })).toHaveClass('size-9')
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

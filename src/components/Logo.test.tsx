import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

describe('Logo', () => {
  it('has a real accessible name, unlike the purely decorative illustrations', () => {
    const { container } = render(<Logo />)

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('alt', 'remeeesa')
    expect(img).not.toHaveAttribute('aria-hidden')
  })

  it('defaults to the dark variant with no color-inverting filter', () => {
    const { container } = render(<Logo />)

    const img = container.querySelector('img')
    expect(img).not.toHaveClass('invert')
  })

  it('inverts to a white silhouette in the light variant', () => {
    const { container } = render(<Logo variant="light" />)

    const img = container.querySelector('img')
    expect(img).toHaveClass('brightness-0', 'invert')
  })

  it('passes a caller className through alongside object-contain', () => {
    const { container } = render(<Logo className="h-7" />)

    const img = container.querySelector('img')
    expect(img).toHaveClass('object-contain', 'h-7')
  })
})

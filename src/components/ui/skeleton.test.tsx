import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Skeleton } from './skeleton'

describe('Skeleton', () => {
  it('is hidden from assistive tech -- callers pair it with their own status text', () => {
    const { container } = render(<Skeleton className="h-4 w-24" />)

    const skeleton = container.firstElementChild
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
  })

  it('accepts a shape via className, per call site', () => {
    const { container } = render(<Skeleton className="size-11 rounded-full" />)

    expect(container.firstElementChild).toHaveClass('size-11', 'rounded-full')
  })
})

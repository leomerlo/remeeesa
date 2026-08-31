import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OnboardingIllustration } from './OnboardingIllustration'

describe('OnboardingIllustration', () => {
  it('renders as a decorative graphic hidden from assistive technology', () => {
    const { container } = render(<OnboardingIllustration />)

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('passes through a className for sizing', () => {
    const { container } = render(
      <OnboardingIllustration className="h-32 w-32" />,
    )

    expect(container.querySelector('svg')).toHaveClass('h-32', 'w-32')
  })

  it('uses non-colliding gradient and filter ids across multiple instances', () => {
    const { container } = render(
      <>
        <OnboardingIllustration />
        <OnboardingIllustration />
      </>,
    )

    const svgs = container.querySelectorAll('svg')
    expect(svgs).toHaveLength(2)

    const idsPerInstance = Array.from(svgs).map((svg) =>
      Array.from(svg.querySelectorAll('[id]')).map((el) => el.id),
    )
    const [firstIds, secondIds] = idsPerInstance
    expect(firstIds).toBeDefined()
    expect(secondIds).toBeDefined()
    expect(firstIds?.length).toBeGreaterThan(0)
    expect(secondIds?.length).toBe(firstIds?.length)

    const overlap = firstIds?.filter((id) => secondIds?.includes(id)) ?? []
    expect(overlap).toEqual([])
  })
})

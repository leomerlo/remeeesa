import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Illustration } from './Illustration'
import { ILLUSTRATIONS } from './illustrations'
import { PiggyBankIllustration } from '@/features/expenses/PiggyBankIllustration'
import { OnboardingIllustration } from '@/features/onboarding/OnboardingIllustration'

describe('Illustration', () => {
  it('is hidden from assistive technology, since the text beside it already says the same thing', () => {
    const { container } = render(<Illustration src="/x.webp" />)

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('aria-hidden', 'true')
    expect(img).toHaveAttribute('alt', '')
  })

  // Call sites size these with both a width and a height, and the artwork is
  // not that aspect ratio, so losing object-contain would stretch the mascot.
  it('always constrains the artwork, with or without a caller className', () => {
    const { container } = render(
      <>
        <Illustration src="/x.webp" />
        <Illustration src="/x.webp" className="h-32 w-40" />
      </>,
    )

    const [bare, sized] = Array.from(container.querySelectorAll('img'))
    expect(bare).toHaveClass('object-contain')
    expect(sized).toHaveClass('object-contain', 'h-32', 'w-40')
  })
})

describe('the named illustrations', () => {
  it.each([
    ['PiggyBankIllustration', PiggyBankIllustration],
    ['OnboardingIllustration', OnboardingIllustration],
  ])(
    '%s renders decorative artwork and passes a className through',
    (_name, Component) => {
      const { container } = render(<Component className="h-16 w-20" />)

      const img = container.querySelector('img')
      expect(img).toHaveAttribute('aria-hidden', 'true')
      expect(img).toHaveClass('h-16', 'w-20')
      expect(img?.getAttribute('src')).toBeTruthy()
    },
  )

  it('gives each slot its own artwork rather than reusing one image', () => {
    const { container } = render(
      <>
        <PiggyBankIllustration />
        <OnboardingIllustration />
        <Illustration src={ILLUSTRATIONS.writing} />
        <Illustration src={ILLUSTRATIONS.saving} />
        <Illustration src={ILLUSTRATIONS.counting} />
        <Illustration src={ILLUSTRATIONS.celebrating} />
      </>,
    )

    const sources = Array.from(container.querySelectorAll('img')).map((img) =>
      img.getAttribute('src'),
    )
    // The four named drawings are four distinct files: an empty state that
    // picks `saving` must not quietly get the same picture as one that picks
    // `writing`.
    expect(new Set(sources).size).toBe(4)
  })
})

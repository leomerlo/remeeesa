import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SampleHeading } from './SampleHeading'

describe('SampleHeading', () => {
  it('renders the given text as a heading', () => {
    render(<SampleHeading text="Household budget" />)
    expect(
      screen.getByRole('heading', { name: 'Household budget' }),
    ).toBeInTheDocument()
  })
})

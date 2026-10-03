import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select } from './select'

describe('Select', () => {
  // The reported bug: at the 8px padding most of these were hand-rolled
  // with, the native chevron sat against the border on every dropdown.
  it('leaves the native chevron room to stand clear of the border', () => {
    render(
      <Select aria-label="Moneda">
        <option value="ARS">$</option>
      </Select>,
    )

    expect(screen.getByLabelText('Moneda')).toHaveClass('pr-9')
  })

  it('matches the Input field it sits beside', () => {
    render(
      <Select aria-label="Moneda">
        <option value="ARS">$</option>
      </Select>,
    )

    const select = screen.getByLabelText('Moneda')
    expect(select).toHaveClass('h-12', 'rounded-lg', 'border', 'border-input')
  })

  it('keeps a caller className without losing the chevron room', () => {
    render(
      <Select aria-label="Moneda" className="w-auto shrink-0 text-sm">
        <option value="ARS">$</option>
      </Select>,
    )

    const select = screen.getByLabelText('Moneda')
    expect(select).toHaveClass('pr-9', 'w-auto', 'shrink-0')
  })

  it('passes its props through to the native element', () => {
    render(
      <Select aria-label="Moneda" disabled defaultValue="USD">
        <option value="ARS">$</option>
        <option value="USD">US$</option>
      </Select>,
    )

    const select = screen.getByLabelText('Moneda')
    expect(select).toBeDisabled()
    expect(select).toHaveValue('USD')
  })
})

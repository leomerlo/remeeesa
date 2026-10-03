import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Select } from './select'

function renderSelect(props: { readonly className?: string } = {}) {
  render(
    <Select aria-label="Moneda" {...props}>
      <option value="ARS">$</option>
      <option value="USD">US$</option>
    </Select>,
  )
  return screen.getByLabelText('Moneda')
}

describe('Select', () => {
  // The reported bug: the browser draws a native select's chevron where it
  // likes, and padding-right does not move it reliably -- on a narrow field
  // it ended up against the border while a wide one looked fine.
  it('drops the browser chevron and draws its own', () => {
    const select = renderSelect()

    expect(select).toHaveClass('appearance-none')
    const chevron = select.parentElement?.querySelector('svg')
    expect(chevron).not.toBeNull()
    // Positioned from the edge, so the inset is the same at any width.
    expect(chevron).toHaveClass('absolute', 'right-3')
  })

  it('keeps the chevron out of the way of the text and of taps', () => {
    const select = renderSelect()
    const chevron = select.parentElement?.querySelector('svg')

    // Room for it, and clicks still reach the select underneath.
    expect(select).toHaveClass('pr-10')
    expect(chevron).toHaveClass('pointer-events-none')
    expect(chevron).toHaveAttribute('aria-hidden', 'true')
  })

  it('matches the Input field it sits beside', () => {
    const select = renderSelect()

    expect(select).toHaveClass('h-12', 'rounded-lg', 'border', 'border-input')
  })

  // Callers size the field; the chevron spacing is not theirs to lose.
  it('lets a caller set the footprint without touching the field', () => {
    const select = renderSelect({ className: 'w-auto shrink-0 text-sm' })

    expect(select.parentElement).toHaveClass('w-auto', 'shrink-0')
    expect(select).toHaveClass('pr-10')
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

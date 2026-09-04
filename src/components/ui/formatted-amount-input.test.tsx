import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FormattedAmountInput } from './formatted-amount-input'

function Controlled(props: { readonly initial?: string }) {
  const [value, setValue] = useState(props.initial ?? '')
  return (
    <FormattedAmountInput
      aria-label="Monto"
      value={value}
      onChange={setValue}
    />
  )
}

describe('FormattedAmountInput', () => {
  it('displays a typed whole number with es-AR thousands grouping', () => {
    render(<Controlled />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    fireEvent.change(input, { target: { value: '500000' } })

    expect(input.value).toBe('500.000')
  })

  it('emits the raw, ungrouped value to onChange', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput aria-label="Monto" value="" onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '500000' },
    })

    expect(onChange).toHaveBeenCalledWith('500000')
  })

  it('converts a typed comma into the decimal point the value stores', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput aria-label="Monto" value="" onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '12,5' },
    })

    expect(onChange).toHaveBeenCalledWith('12.5')
  })

  it('shows a stored decimal value with a comma, grouped', () => {
    render(<Controlled initial="500000.5" />)

    expect(screen.getByLabelText('Monto')).toHaveValue('500.000,5')
  })

  it('renders blank rather than "0" for an empty value', () => {
    render(<Controlled />)

    expect(screen.getByLabelText('Monto')).toHaveValue('')
  })

  it('drops non-digit characters other than the first comma', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput aria-label="Monto" value="" onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: 'abc12,5,6' },
    })

    // Only the first comma is treated as the decimal separator; everything
    // else -- letters, the second comma -- is stripped.
    expect(onChange).toHaveBeenCalledWith('12.56')
  })

  // The whole reason this component exists rather than a plain input: typing
  // in the middle of a grouped number must not throw the caret to the end,
  // which is what happens if the display value changes without also
  // updating selectionStart/selectionEnd.
  it('keeps the caret at the digit just typed, not at the end of the field', () => {
    render(<Controlled initial="50000" />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement
    expect(input.value).toBe('50.000')

    // Place the caret between the two leading digits ("5|0.000") and type
    // "9", simulating what fireEvent.change alone can't: a keystroke at a
    // specific caret position rather than a full-value replacement.
    input.setSelectionRange(1, 1)
    fireEvent.change(input, {
      target: { value: '590.000', selectionStart: 2, selectionEnd: 2 },
    })

    expect(input.value).toBe('590.000')
    expect(input.selectionStart).toBe(2)
  })
})

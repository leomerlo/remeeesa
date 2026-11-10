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

  // Per direct feedback: typing the comma put the caret back in front of it,
  // so the comma stayed stranded at the end of the field and every following
  // digit landed in the integer part -- "3.900," became "3.9004,".
  it('leaves the caret after the comma just typed, not in front of it', () => {
    render(<Controlled initial="3900" />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement
    expect(input.value).toBe('3.900')

    // The comma typed at the end of "3.900".
    fireEvent.change(input, {
      target: { value: '3.900,', selectionStart: 6 },
    })

    expect(input.value).toBe('3.900,')
    expect(input.selectionStart).toBe(6)
  })

  it('keeps typing decimals after the comma rather than back in the pesos', () => {
    render(<Controlled initial="3900" />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    fireEvent.change(input, { target: { value: '3.900,', selectionStart: 6 } })
    fireEvent.change(input, { target: { value: '3.900,5', selectionStart: 7 } })

    expect(input.value).toBe('3.900,5')
    expect(input.selectionStart).toBe(7)
  })

  // Also per direct feedback: a stray comma used to change the magnitude
  // silently. "3", ",", "900" stored 3.900 -- three pesos ninety -- while
  // still reading like the three thousand nine hundred that was meant.
  it('keeps at most two decimals, so a stray comma cannot rescale the amount', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput aria-label="Monto" value="" onChange={onChange} />,
    )

    fireEvent.change(screen.getByLabelText('Monto'), {
      target: { value: '3,900' },
    })

    expect(onChange).toHaveBeenCalledWith('3.90')
  })

  // The period key. Many number pads emit "." no matter what the app shows,
  // and this used to work only while the amount was under four digits --
  // past that the first "." is grouping, the typed one was dropped, and the
  // next digit landed in the pesos. "1234" then "." then "5" stored 12345.
  it('takes a typed period as the decimal point once the amount is grouped', () => {
    render(<Controlled />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    fireEvent.change(input, { target: { value: '1234' } })
    expect(input.value).toBe('1.234')

    fireEvent.change(input, { target: { value: '1.234.' } })
    expect(input.value).toBe('1.234,')

    fireEvent.change(input, { target: { value: '1.234,5' } })
    expect(input.value).toBe('1.234,5')
  })

  it('does not multiply the amount by ten when a period is typed after grouping', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput
        aria-label="Monto"
        value="1234"
        onChange={onChange}
      />,
    )
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    fireEvent.change(input, { target: { value: '1.234.' } })

    expect(onChange).toHaveBeenCalledWith('1234.')
  })

  it('still reads a trailing period as grouping when three digits follow it', () => {
    const onChange = vi.fn()
    render(
      <FormattedAmountInput aria-label="Monto" value="" onChange={onChange} />,
    )
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    // A pasted, already-grouped amount: no decimal point anywhere in it.
    fireEvent.change(input, { target: { value: '1.234.567' } })

    expect(onChange).toHaveBeenCalledWith('1234567')
  })

  // Backspace on a grouping separator used to do nothing at all: the "."
  // is not part of the value, so it reformatted straight back.
  it('deletes the digit in front of a grouping separator when it is backspaced', () => {
    render(<Controlled initial="1234" />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement
    expect(input.value).toBe('1.234')

    // Backspace with the caret just after the ".": the browser hands us the
    // value minus that separator, caret where the separator was.
    fireEvent.change(input, {
      target: { value: '1234', selectionStart: 1, selectionEnd: 1 },
    })

    expect(input.value).toBe('234')
  })

  it('leaves an ordinary digit deletion alone', () => {
    render(<Controlled initial="1234" />)
    const input = screen.getByLabelText('Monto') as HTMLInputElement

    // Backspace at the end removes the "4", not anything next to a period.
    fireEvent.change(input, {
      target: { value: '1.23', selectionStart: 4, selectionEnd: 4 },
    })

    expect(input.value).toBe('123')
  })

  it('still round-trips a two-decimal amount untouched', () => {
    render(<Controlled initial="1234.56" />)
    expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe(
      '1.234,56',
    )
  })
})

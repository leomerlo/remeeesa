import { useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, ComponentProps } from 'react'
import { amountKeystroke, formatAmountForDisplay } from '@/lib/money'
import { Input } from './input'

export type FormattedAmountInputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange' | 'inputMode' | 'type'
> & {
  // Always a plain, Number()-parseable string ("500000", "12.5", "") -- the
  // same shape every amount field already stored before this component
  // existed. Only the on-screen text gets es-AR grouping; parseExpensePrice,
  // parseMonthlyBudget and friends keep working on the raw value unchanged.
  readonly value: string
  readonly onChange: (raw: string) => void
}

// A plain <Input inputMode="decimal"> shows exactly what was typed --
// "500000" stays "500000" for as long as someone's typing it, unlike every
// other amount on screen ("$500.000,00"). This formats with the same es-AR
// grouping live, keystroke by keystroke, restoring the caret to the digit
// the user was actually at rather than letting the browser's default
// "value changed, caret goes to the end" behavior take over.
//
// All of the reading and writing lives in @/lib/money/amountText, so the
// beta's own amount fields behave identically without borrowing this
// component. Every rule, and why it is there, is documented beside it.
export function FormattedAmountInput({
  value,
  onChange,
  ...props
}: FormattedAmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretRef = useRef<number | null>(null)
  // Whether the comma on screen came from a "." typed by hand, which
  // the next keystroke may yet show to have been a thousands separator.
  const pendingDotRef = useRef(false)
  const display = formatAmountForDisplay(value)

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    if (caret !== null && inputRef.current !== null) {
      inputRef.current.setSelectionRange(caret, caret)
      pendingCaretRef.current = null
    }
  }, [display])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.target
    const next = amountKeystroke({
      typed: input.value,
      caret: input.selectionStart ?? input.value.length,
      previousDisplay: display,
      pendingDot: pendingDotRef.current,
    })
    pendingCaretRef.current = next.caret
    pendingDotRef.current = next.pendingDot
    onChange(next.raw)
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      {...props}
    />
  )
}

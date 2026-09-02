import { useLayoutEffect, useRef } from 'react'
import type { ChangeEvent, ComponentProps } from 'react'
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

const GROUPING = new Intl.NumberFormat('es-AR')

// "500000" -> "500.000"; "500000.5" -> "500.000,5"; "-500" -> "-500". Empty
// input stays empty rather than becoming "0" -- a blank required field
// should still look blank, not like a zero someone typed. A leading "-"
// survives so parseExpensePrice/parseMonthlyBudget/etc. still see (and
// reject, with their real "must be positive" message) a negative amount
// instead of it silently vanishing into a valid positive one.
function formatForDisplay(raw: string): string {
  const isNegative = raw.startsWith('-')
  const unsigned = isNegative ? raw.slice(1) : raw
  const sign = isNegative ? '-' : ''
  const [intPart, decimalPart] = unsigned.split('.')
  const digits = intPart.replace(/\D/g, '')
  const grouped = digits === '' ? '' : GROUPING.format(BigInt(digits))
  return decimalPart === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped},${decimalPart}`
}

// The inverse of formatForDisplay, applied to whatever the user just typed
// -- "," is the unambiguous decimal separator (it's the only character
// formatForDisplay ever inserts for that purpose; "." is its thousands
// grouping separator instead). Only the *first* "," typed counts as the
// decimal point, matching the display's own single-decimal-point shape;
// everything after it (including any further ",") keeps only digits, same
// as before this component understood "." at all.
//
// A "." is ambiguous when there's no ",": es-AR grouping periods always
// trail with exactly 3 digits, and mid-keystroke editing next to a stale
// grouping period can momentarily produce even more -- so the *first* "."
// followed by 3+ digits is treated as grouping noise (stripped, matching
// the pre-existing typed-number behavior), while 0-2 trailing digits means
// the user actually pressed "." as their decimal key, which many
// number-pad keyboards produce regardless of the app's own comma-decimal
// display (without this, "12.5" typed that way would silently mangle into
// "125").
function parseTyped(displayed: string): string {
  const isNegative = displayed.trimStart().startsWith('-')
  const sign = isNegative ? '-' : ''

  const commaIndex = displayed.indexOf(',')
  let separatorIndex = commaIndex
  if (separatorIndex === -1) {
    const periodIndex = displayed.indexOf('.')
    if (periodIndex !== -1) {
      const trailingDigits = displayed.slice(periodIndex + 1).replace(/\D/g, '')
      if (trailingDigits.length <= 2) {
        separatorIndex = periodIndex
      }
    }
  }

  if (separatorIndex === -1) {
    return sign + displayed.replace(/\D/g, '')
  }
  const intPart = displayed.slice(0, separatorIndex).replace(/\D/g, '')
  const decimalPart = displayed.slice(separatorIndex + 1).replace(/\D/g, '')
  return `${sign}${intPart}.${decimalPart}`
}

function digitCountBefore(text: string, position: number): number {
  let count = 0
  for (let i = 0; i < position && i < text.length; i += 1) {
    if (/\d/.test(text[i] ?? '')) {
      count += 1
    }
  }
  return count
}

// The caret position landing right after the Nth digit in text -- grouping
// separators inserted before that point don't count as a digit typed, so
// the caret still ends up right where the user's next keystroke belongs
// instead of jumping to the end of the field, which is what a naive
// re-format-on-every-keystroke does.
function positionAfterDigitCount(text: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0
  }
  let seen = 0
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i] ?? '')) {
      seen += 1
      if (seen === digitCount) {
        return i + 1
      }
    }
  }
  return text.length
}

// A plain <Input inputMode="decimal"> shows exactly what was typed --
// "500000" stays "500000" for as long as someone's typing it, unlike every
// other amount on screen ("$500.000,00"). This formats with the same es-AR
// grouping live, keystroke by keystroke, restoring the caret to the digit
// the user was actually at rather than letting the browser's default
// "value changed, caret goes to the end" behavior take over.
export function FormattedAmountInput({
  value,
  onChange,
  ...props
}: FormattedAmountInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingCaretRef = useRef<number | null>(null)
  const display = formatForDisplay(value)

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current
    if (caret !== null && inputRef.current !== null) {
      inputRef.current.setSelectionRange(caret, caret)
      pendingCaretRef.current = null
    }
  }, [display])

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.target
    const caretBefore = input.selectionStart ?? input.value.length
    const digitsBeforeCaret = digitCountBefore(input.value, caretBefore)
    const nextRaw = parseTyped(input.value)
    const nextDisplay = formatForDisplay(nextRaw)
    pendingCaretRef.current = positionAfterDigitCount(
      nextDisplay,
      digitsBeforeCaret,
    )
    onChange(nextRaw)
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

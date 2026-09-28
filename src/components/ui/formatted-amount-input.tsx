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
// A "." is ambiguous when there's no ",": it is either grouping this
// component inserted or the decimal key a number pad produced, since many
// of them emit "." regardless of the app's comma-decimal display. Two
// things decide, and both are needed:
//
//  - The user has to have *added* a period. Every "." already in the text
//    this render was showing was put there by formatForDisplay, so it is
//    grouping and stays grouping no matter what else changes around it.
//    Without this, backspacing the last digit of "1.234" produced "1.23",
//    which reads as a typed decimal and stored one peso twenty-three.
//  - It has to be the *last* period, with 0-2 digits after it. Anything
//    with three trailing digits is the final grouping separator (a pasted
//    "1.234.567" adds two periods and is still a whole number).
//
// The first of those used to be missing and the second looked at the first
// "." rather than the last, which broke the moment the amount reached four
// digits: the typed decimal point was dropped and the next digit landed in
// the pesos, so "1234" then "." then "5" stored 12345 rather than 1234.5 --
// the amount silently multiplied by ten. Per direct feedback.
function periodCount(text: string): number {
  let count = 0
  for (const character of text) {
    if (character === '.') {
      count += 1
    }
  }
  return count
}

function parseTyped(displayed: string, previousDisplay: string): string {
  const isNegative = displayed.trimStart().startsWith('-')
  const sign = isNegative ? '-' : ''

  const commaIndex = displayed.indexOf(',')
  let separatorIndex = commaIndex
  if (separatorIndex === -1) {
    const periodIndex = displayed.lastIndexOf('.')
    const addedAPeriod = periodCount(displayed) > periodCount(previousDisplay)
    if (periodIndex !== -1 && addedAPeriod) {
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
  // Two decimals, no more. Money has two, and without the cap a stray comma
  // silently changes the magnitude of what is being typed: "3", ",", "900"
  // stored 3.900 -- three pesos ninety -- while reading, at a glance, like
  // the three thousand nine hundred that was meant. Per direct feedback.
  const decimalPart = displayed
    .slice(separatorIndex + 1)
    .replace(/\D/g, '')
    .slice(0, 2)
  return `${sign}${intPart}.${decimalPart}`
}

// Digits and the decimal comma both count; the grouping periods do not,
// since they are inserted and removed by the formatter rather than typed.
//
// Counting digits alone was the bug: type a comma and it is not a digit, so
// the caret came back to rest after the last *digit* -- in front of the
// comma just typed. Every following keystroke then landed in the integer
// part and the comma stayed stranded at the end, which is exactly what
// "3.900," turning into "3.9004," looks like from the outside.
function isSignificant(character: string): boolean {
  return /\d/.test(character) || character === ','
}

function significantCountBefore(text: string, position: number): number {
  let count = 0
  for (let i = 0; i < position && i < text.length; i += 1) {
    if (isSignificant(text[i] ?? '')) {
      count += 1
    }
  }
  return count
}

// The caret position landing right after the Nth significant character --
// grouping separators inserted before that point don't count as something
// typed, so the caret still ends up right where the user's next keystroke
// belongs instead of jumping to the end of the field, which is what a naive
// re-format-on-every-keystroke does.
function positionAfterSignificantCount(text: string, count: number): number {
  if (count <= 0) {
    return 0
  }
  let seen = 0
  for (let i = 0; i < text.length; i += 1) {
    if (isSignificant(text[i] ?? '')) {
      seen += 1
      if (seen === count) {
        return i + 1
      }
    }
  }
  return text.length
}

// Backspace landing on a grouping separator did nothing: the "." is not
// part of the value, so removing it reformatted straight back to what was
// there and the caret sat in the same place. Pressing a key and watching
// nothing happen reads as a broken field, so a deletion that removed only
// a grouping separator is retargeted at the digit in front of it, which is
// what the keystroke meant.
//
// Recognised by comparing against the display this render was showing,
// rather than by reading nativeEvent.inputType: the guard is exact (the
// removed character must be a grouping period and the rest must match
// character for character), and it does not depend on an InputEvent field
// that not every environment sets.
function retargetGroupingDelete(input: {
  readonly previousDisplay: string
  readonly nextValue: string
  readonly caret: number
}): { readonly value: string; readonly caret: number } | null {
  const { previousDisplay, nextValue, caret } = input
  if (previousDisplay[caret] !== '.' || caret < 1) {
    return null
  }
  const withoutSeparator =
    previousDisplay.slice(0, caret) + previousDisplay.slice(caret + 1)
  if (withoutSeparator !== nextValue) {
    return null
  }
  return {
    value: nextValue.slice(0, caret - 1) + nextValue.slice(caret),
    caret: caret - 1,
  }
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
    const rawCaret = input.selectionStart ?? input.value.length
    const retargeted = retargetGroupingDelete({
      previousDisplay: display,
      nextValue: input.value,
      caret: rawCaret,
    })
    const typed = retargeted?.value ?? input.value
    const caretBefore = retargeted?.caret ?? rawCaret
    const significantBeforeCaret = significantCountBefore(typed, caretBefore)
    const nextRaw = parseTyped(typed, display)
    const nextDisplay = formatForDisplay(nextRaw)
    pendingCaretRef.current = positionAfterSignificantCount(
      nextDisplay,
      significantBeforeCaret,
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

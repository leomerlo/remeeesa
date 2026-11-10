// Reading and writing an amount the way this country writes one: a dot
// groups the thousands and a comma is the decimal point, so "1.234,56" is
// one thousand two hundred and thirty-four pesos fifty-six.
//
// All of it works on two strings and never on a number:
//
//  - the **raw** value, which is what the form holds and what Number()
//    parses -- "1234.56", "500000", "" -- the shape every amount field
//    stored before any of this existed.
//  - the **display**, which is what the field shows while somebody types
//    in it -- "1.234,56".
//
// This lives here, beside the currencies, rather than inside either
// interface, because both of them ask for an amount and getting this
// wrong is not a cosmetic bug: a dot read as a decimal point where a
// thousands separator was meant turns five hundred thousand into five
// hundred, and a dot read the other way turns twelve pesos fifty into
// twelve hundred and fifty. Every rule below was written against a real
// amount that came out wrong.

const GROUPING = new Intl.NumberFormat('es-AR')

// "500000" -> "500.000"; "500000.5" -> "500.000,5"; "-500" -> "-500". Empty
// input stays empty rather than becoming "0" -- a blank required field
// should still look blank, not like a zero someone typed. A leading "-"
// survives so whoever validates the amount still sees (and rejects, with
// its real "has to be positive" message) a negative one instead of it
// silently vanishing into a valid positive.
export function formatAmountForDisplay(raw: string): string {
  const isNegative = raw.startsWith('-')
  const unsigned = isNegative ? raw.slice(1) : raw
  const sign = isNegative ? '-' : ''
  const [intPart, decimalPart] = unsigned.split('.')
  const digits = (intPart ?? '').replace(/\D/gu, '')
  const grouped = digits === '' ? '' : GROUPING.format(BigInt(digits))
  return decimalPart === undefined
    ? `${sign}${grouped}`
    : `${sign}${grouped},${decimalPart}`
}

function periodCount(text: string): number {
  let count = 0
  for (const character of text) {
    if (character === '.') count += 1
  }
  return count
}

// The inverse of formatAmountForDisplay, applied to whatever was just
// typed -- "," is the unambiguous decimal separator (it is the only
// character formatAmountForDisplay ever inserts for that purpose; "." is
// its thousands grouping instead). Only the *first* "," typed counts as
// the decimal point, matching the display's own single-decimal-point
// shape; everything after it (including any further ",") keeps only
// digits.
//
// A "." is ambiguous when there is no ",": it is either grouping this
// module inserted or the decimal key a number pad produced, since many of
// them emit "." regardless of the app's comma-decimal display. Two things
// decide, and both are needed:
//
//  - A period has to have been *added*. Every "." already in the text the
//    field was showing was put there by formatAmountForDisplay, so it is
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
export function rawFromTypedAmount(
  typed: string,
  previousDisplay: string,
): string {
  return read(typed, previousDisplay).raw
}

// The same, and also where in the typed text the decimal separator turned
// out to be. The caret needs that: the character the household just typed
// for it may be a "." or a ",", and one of those is otherwise the
// grouping separator, which does not count as something typed.
function read(
  typed: string,
  previousDisplay: string,
): {
  readonly raw: string
  readonly separatorIndex: number
  // Whether that separator was a "." the household typed, which is the
  // one that may still turn out to be a thousands separator.
  readonly fromPeriod: boolean
} {
  const isNegative = typed.trimStart().startsWith('-')
  const sign = isNegative ? '-' : ''

  const commaIndex = typed.indexOf(',')
  let separatorIndex = commaIndex
  if (separatorIndex === -1) {
    const periodIndex = typed.lastIndexOf('.')
    const addedAPeriod = periodCount(typed) > periodCount(previousDisplay)
    if (periodIndex !== -1 && addedAPeriod) {
      const trailingDigits = typed.slice(periodIndex + 1).replace(/\D/gu, '')
      if (trailingDigits.length <= 2) separatorIndex = periodIndex
    }
  }

  const fromPeriod = commaIndex === -1 && separatorIndex !== -1
  if (separatorIndex === -1) {
    return {
      raw: sign + typed.replace(/\D/gu, ''),
      separatorIndex,
      fromPeriod,
    }
  }
  const intPart = typed.slice(0, separatorIndex).replace(/\D/gu, '')
  // Two decimals, no more. Money has two, and without the cap a stray comma
  // silently changes the magnitude of what is being typed: "3", ",", "900"
  // stored 3.900 -- three pesos ninety -- while reading, at a glance, like
  // the three thousand nine hundred that was meant. Per direct feedback.
  const decimalPart = typed
    .slice(separatorIndex + 1)
    .replace(/\D/gu, '')
    .slice(0, 2)
  return {
    raw: `${sign}${intPart}.${decimalPart}`,
    separatorIndex,
    fromPeriod,
  }
}

function commaCount(text: string): number {
  let count = 0
  for (const character of text) {
    if (character === ',') count += 1
  }
  return count
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
  return /\d/u.test(character) || character === ','
}

// `separatorIndex` is where the decimal separator is in this particular
// text, for the one case the rule above cannot see: the household typed
// "." for it, and a "." is otherwise grouping. Without it the caret came
// back in front of the comma the field had just drawn, so the next digit
// landed in the pesos -- "1234" then "." then "5" became 12.345 on
// screen. The display never needs it: the separator there is always ",".
function significantCountBefore(
  text: string,
  position: number,
  separatorIndex = -1,
): number {
  let count = 0
  for (let i = 0; i < position && i < text.length; i += 1) {
    if (isSignificant(text[i] ?? '') || i === separatorIndex) count += 1
  }
  return count
}

// The caret position landing right after the Nth significant character --
// grouping separators inserted before that point don't count as something
// typed, so the caret still ends up right where the next keystroke
// belongs instead of jumping to the end of the field, which is what a naive
// re-format-on-every-keystroke does.
function positionAfterSignificantCount(text: string, count: number): number {
  if (count <= 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i += 1) {
    if (isSignificant(text[i] ?? '')) {
      seen += 1
      if (seen === count) return i + 1
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
// Recognised by comparing against the display the field was showing,
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
  if (previousDisplay[caret] !== '.' || caret < 1) return null
  const withoutSeparator =
    previousDisplay.slice(0, caret) + previousDisplay.slice(caret + 1)
  if (withoutSeparator !== nextValue) return null
  return {
    value: nextValue.slice(0, caret - 1) + nextValue.slice(caret),
    caret: caret - 1,
  }
}

// One keystroke in an amount field: what the field was showing plus what
// the browser now has in it, answered with the value to store, the text to
// show and where to put the caret. Every amount field in either interface
// goes through this, so "1.234,56" means the same thing in all of them.
export function amountKeystroke(input: {
  // What the input element holds now, straight from the event.
  readonly typed: string
  // Where the caret is in that text, straight from the event.
  readonly caret: number
  // What the field was showing before this keystroke, which is what says
  // whether a "." is grouping or a decimal point just typed.
  readonly previousDisplay: string
  // What the last keystroke answered: the comma on screen came from a
  // "." the household typed, and could still turn out to have been a
  // thousands separator. The field carries it back in -- see below.
  readonly pendingDot?: boolean
}): {
  readonly raw: string
  readonly display: string
  readonly caret: number
  readonly pendingDot: boolean
} {
  const retargeted = retargetGroupingDelete({
    previousDisplay: input.previousDisplay,
    nextValue: input.typed,
    caret: input.caret,
  })
  const typed = retargeted?.value ?? input.typed
  const caretBefore = retargeted?.caret ?? input.caret
  const base = read(typed, input.previousDisplay)
  const { separatorIndex } = base
  let raw = base.raw
  let pendingDot = base.fromPeriod

  // Somebody writing an amount out in full types the thousands separator
  // themselves: "1", ".", "2", "3", "4", ",", "5", "6". After the ".",
  // with one digit in front of it, there is no way to tell that from
  // "1.5" -- so the field shows a decimal comma and remembers that it was
  // a guess. The third digit after it settles the question, because no
  // decimal has three digits and every group of thousands does: it was
  // grouping all along, and the amount is 1.234.
  //
  // Only for a "." -- a comma typed by hand is the decimal point and
  // nothing else, and capping it at two decimals is what keeps a stray
  // one from changing the size of the figure.
  const typedAComma = commaCount(typed) > commaCount(input.previousDisplay)
  if (
    input.pendingDot === true &&
    !typedAComma &&
    !base.fromPeriod &&
    separatorIndex !== -1
  ) {
    const sign = raw.startsWith('-') ? '-' : ''
    const intDigits = typed.slice(0, separatorIndex).replace(/\D/gu, '')
    const decimals = typed.slice(separatorIndex + 1).replace(/\D/gu, '')
    // One to three digits in front: that is what the first group of a
    // written-out amount looks like. Four or more and the "." was never
    // grouping, so a third decimal is just a third decimal, and the cap
    // takes it.
    if (
      decimals.length >= 3 &&
      intDigits.length >= 1 &&
      intDigits.length <= 3
    ) {
      raw = `${sign}${intDigits}${decimals}`
      pendingDot = false
    } else {
      pendingDot = true
    }
  }

  const significant = significantCountBefore(typed, caretBefore, separatorIndex)
  const display = formatAmountForDisplay(raw)
  return {
    raw,
    display,
    caret: positionAfterSignificantCount(display, significant),
    pendingDot,
  }
}

// What an amount string stored somewhere is worth, read as tolerantly as
// it can be read without guessing.
//
// A raw value is plain and Number() has it ("1234.56"). But a figure typed
// into a field that did none of the above is stored as it was typed, and
// those are still out there -- a projection's overrides live in the
// database. So a comma means the amount was written the way this country
// writes one, and a dot with exactly three digits after it is a thousands
// separator, which no raw value ever has: raw decimals are capped at two.
// Anything else is plain.
export function parseStoredAmount(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const written =
    trimmed.includes(',') || /\.\d{3}(?:\.|$)/u.test(trimmed)
      ? trimmed.replace(/\./gu, '').replace(/,/gu, '.')
      : trimmed
  const parsed = Number(written)
  return Number.isFinite(parsed) ? parsed : 0
}

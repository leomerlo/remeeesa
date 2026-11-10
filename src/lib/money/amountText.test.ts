import { describe, expect, it } from 'vitest'
import {
  amountKeystroke,
  formatAmountForDisplay,
  parseStoredAmount,
} from './amountText'

// What one keystroke leaves in the field, which is all any amount field
// does. `before` is what it was showing; `typed` is what the browser has
// in it now.
const keystroke = (typed: string, before = ''): string =>
  amountKeystroke({ typed, caret: typed.length, previousDisplay: before }).raw

const shown = (typed: string, before = ''): string =>
  amountKeystroke({ typed, caret: typed.length, previousDisplay: before })
    .display

describe('an amount as it is shown', () => {
  it('separates the thousands the way they are written here', () => {
    expect(formatAmountForDisplay('500000')).toBe('500.000')
    expect(formatAmountForDisplay('1234567')).toBe('1.234.567')
  })

  it('writes the decimals after a comma', () => {
    expect(formatAmountForDisplay('500000.5')).toBe('500.000,5')
    expect(formatAmountForDisplay('1234.56')).toBe('1.234,56')
  })

  // A blank required field should still look blank, not like a zero
  // somebody typed.
  it('leaves an empty field empty', () => {
    expect(formatAmountForDisplay('')).toBe('')
  })

  // So that whoever validates the amount still sees a negative one, and
  // rejects it with its real message, instead of it quietly turning into
  // a valid positive.
  it('keeps a minus sign', () => {
    expect(formatAmountForDisplay('-500')).toBe('-500')
  })
})

describe('an amount as it is typed', () => {
  // The way the amount is written here, and the way the app writes every
  // figure back: a dot groups the thousands, a comma is the decimal point.
  it('reads a dot as thousands and a comma as the decimals', () => {
    expect(keystroke('1.234,56')).toBe('1234.56')
    expect(shown('1.234,56')).toBe('1.234,56')
  })

  // The one that was coming out a hundred times too big. A phone's number
  // pad has one decimal key and it types ".", whatever the app shows, so
  // "1234.56" means one thousand two hundred and thirty-four fifty-six --
  // and used to be stored as a hundred and twenty-three thousand.
  it('reads a dot as the decimal point when that is what it can only be', () => {
    expect(keystroke('1234.56')).toBe('1234.56')
    expect(keystroke('5.5')).toBe('5.5')
  })

  // Three digits after it is a grouping separator, not a decimal point: a
  // pasted "1.234.567" is a whole number.
  it('reads a dot with three digits after it as thousands', () => {
    expect(keystroke('1.234.567')).toBe('1234567')
  })

  // Backspacing the last digit of "1.234" leaves "1.23", which reads like
  // a typed decimal and used to store one peso twenty-three. The period
  // was already there, so it is grouping and stays grouping.
  it('does not turn a separator already on screen into a decimal point', () => {
    expect(keystroke('1.23', '1.234')).toBe('123')
  })

  // Money has two decimals. Without the cap a stray comma silently
  // changes what is being typed: "3", ",", "900" stored three pesos
  // ninety while reading like the three thousand nine hundred meant.
  it('keeps two decimals and no more', () => {
    expect(keystroke('3,9004')).toBe('3.90')
  })

  // Re-formatting on every keystroke moves the text under the cursor; the
  // caret comes back after the digit just typed rather than at the end of
  // the field.
  it('leaves the caret where the next keystroke belongs', () => {
    // A 9 typed into the middle of "1.234", right after the 2. The field
    // re-groups to "12.934" and the caret comes back after that 9 --
    // where the next keystroke belongs -- instead of at the end of the
    // field, which is where a browser left to itself drops it.
    const next = amountKeystroke({
      typed: '1.2934',
      caret: 4,
      previousDisplay: '1.234',
    })
    expect(next.raw).toBe('12934')
    expect(next.display).toBe('12.934')
    expect(next.display.slice(0, next.caret)).toBe('12.9')
  })

  // The amount an edit sheet opens on is the stored one, and opening a
  // gasto of 1234.56 and saving it unchanged used to store 123456.
  it('round-trips an amount that came out of the database', () => {
    const stored = '36800.5'
    const display = formatAmountForDisplay(stored)
    expect(display).toBe('36.800,5')
    expect(keystroke(display, display)).toBe(stored)
  })
})

describe('an amount read back out of storage', () => {
  it('reads the plain value a field hands over', () => {
    expect(parseStoredAmount('1234.56')).toBe(1234.56)
    expect(parseStoredAmount('150000')).toBe(150000)
  })

  // Figures saved before the field knew how to format itself were stored
  // as they were typed, separators and all. A month's projection has
  // some.
  it('reads a figure that was stored as it was written', () => {
    expect(parseStoredAmount('1.234,56')).toBe(1234.56)
    expect(parseStoredAmount('150.000')).toBe(150000)
    expect(parseStoredAmount('1.234.567')).toBe(1234567)
  })

  it('is nothing when there is nothing, or nothing readable', () => {
    expect(parseStoredAmount('')).toBe(0)
    expect(parseStoredAmount('   ')).toBe(0)
    expect(parseStoredAmount('qué')).toBe(0)
  })
})

// A figure typed one key at a time, each keystroke landing at the caret
// the one before it left -- which is the only way the caret bugs show up.
// Pasting a whole figure in never moves the caret into the middle of
// anything.
function typeIn(keys: string): {
  readonly raw: string
  readonly display: string
  readonly caret: number
} {
  let display = ''
  let raw = ''
  let caret = 0
  // The one thing the field remembers between keystrokes: see
  // amountKeystroke.
  let pendingDot = false
  for (const key of keys) {
    const next = amountKeystroke({
      typed: display.slice(0, caret) + key + display.slice(caret),
      caret: caret + 1,
      previousDisplay: display,
      pendingDot,
    })
    raw = next.raw
    display = next.display
    caret = next.caret
    pendingDot = next.pendingDot
  }
  return { raw, display, caret }
}

describe('a figure typed key by key', () => {
  it('groups the thousands as they arrive', () => {
    expect(typeIn('250000')).toMatchObject({
      raw: '250000',
      display: '250.000',
    })
  })

  // The caret used to come back in front of the comma the field had just
  // drawn, so the next digit landed in the pesos: "1234", ".", "5" read
  // 12.345 on screen and stored twelve thousand three hundred and
  // forty-five. The decimal key on a phone types ".", so this is the
  // ordinary way of typing an amount with cents.
  it('keeps typing after the decimal point, wherever it came from', () => {
    expect(typeIn('1234.5')).toMatchObject({
      raw: '1234.5',
      display: '1.234,5',
    })
    expect(typeIn('1234,56')).toMatchObject({
      raw: '1234.56',
      display: '1.234,56',
    })
    expect(typeIn('1234.56')).toMatchObject({
      raw: '1234.56',
      display: '1.234,56',
    })
  })

  // Both separators typed, which is how an amount is written here.
  it('takes a figure written out in full', () => {
    expect(typeIn('1.234,56')).toMatchObject({
      raw: '1234.56',
      display: '1.234,56',
    })
  })

  it('leaves the caret at the end, where the next key belongs', () => {
    const typed = typeIn('1234.56')
    expect(typed.caret).toBe(typed.display.length)
  })
})

describe('what a comma typed by hand still means', () => {
  // Her own, from before: a comma typed by hand is the decimal point and
  // nothing else, so it is capped at two decimals. Only a "." is ever
  // reconsidered, because only a "." is ambiguous.
  it('caps a typed comma at two decimals', () => {
    expect(typeIn('3,900').raw).toBe('3.90')
  })

  // Four digits in front: the "." was never a thousands separator there,
  // so a third decimal is just a third decimal and the cap takes it.
  it('does not reconsider a dot that four digits precede', () => {
    expect(typeIn('1234.567').raw).toBe('1234.56')
  })
})

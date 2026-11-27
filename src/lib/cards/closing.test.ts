import { describe, expect, it } from 'vitest'
import {
  closingDayFor,
  closingMonthKey,
  closingShift,
  parseClosingDay,
  parseClosings,
} from './closing'

describe('closingDayFor', () => {
  it('uses the day set for that month', () => {
    expect(closingDayFor({ '2026-11': 26 }, '2026-11')).toBe(26)
  })

  it('carries the last one forward, so it is only edited when it changes', () => {
    expect(closingDayFor({ '2026-11': 26 }, '2026-12')).toBe(26)
    expect(closingDayFor({ '2026-11': 26 }, '2027-03')).toBe(26)
  })

  it('leaves an earlier month with the cierre it actually had', () => {
    const closings = { '2026-11': 26, '2026-12': 22 }
    expect(closingDayFor(closings, '2026-11')).toBe(26)
    expect(closingDayFor(closings, '2026-12')).toBe(22)
  })

  it('has no day before the first one was set', () => {
    expect(closingDayFor({ '2026-11': 26 }, '2026-10')).toBeNull()
    expect(closingDayFor({}, '2026-11')).toBeNull()
  })
})

describe('closingShift', () => {
  const closings = { '2026-11': 26 }

  it('leaves a purchase before the cierre in the next month’s resumen', () => {
    expect(closingShift(closings, new Date(2026, 10, 25, 12))).toBe(0)
  })

  // The household's own statement: the cierre was the 26th and both
  // purchases made on the 26th were listed as Pendiente, outside it.
  it('skips a resumen for a purchase made on the cierre itself', () => {
    expect(closingShift(closings, new Date(2026, 10, 26, 12))).toBe(1)
  })

  it('skips a resumen for a purchase made after the cierre', () => {
    expect(closingShift(closings, new Date(2026, 10, 27, 12))).toBe(1)
  })

  it('does nothing at all when no cierre has been set', () => {
    expect(closingShift({}, new Date(2026, 10, 27, 12))).toBe(0)
  })
})

describe('reading what is stored', () => {
  it('takes a card written before this existed as having no cierre', () => {
    expect(parseClosings(undefined)).toEqual({})
    expect(parseClosings(null)).toEqual({})
    expect(parseClosings('el 26')).toEqual({})
  })

  it('drops anything that is not a month and a day', () => {
    expect(
      parseClosings({
        '2026-11': 26,
        noviembre: 26,
        '2026-13': 4,
        '2026-12': 'el 22',
        '2027-01': 31,
      }),
    ).toEqual({ '2026-11': 26 })
  })

  it('refuses a day a month may not have', () => {
    expect(() => parseClosingDay(29)).toThrow(/del 1 al 28/)
    expect(() => parseClosingDay(0)).toThrow(/del 1 al 28/)
    expect(() => parseClosingDay(26.5)).toThrow(/entero/)
    expect(parseClosingDay(26)).toBe(26)
  })

  it('keys a month the way a resumen id does', () => {
    expect(closingMonthKey(new Date(2026, 10, 27))).toBe('2026-11')
    expect(closingMonthKey(new Date(2027, 0, 2))).toBe('2027-01')
  })
})

import { describe, expect, it } from 'vitest'
import { nextCycleDueDate } from './recurrence'

describe('nextCycleDueDate', () => {
  it('advances a mid-month due date to the same day next month', () => {
    expect(nextCycleDueDate(new Date(2026, 0, 15))).toEqual(
      new Date(2026, 1, 15),
    )
  })

  it('clamps Jan 31 to Feb 28 in a non-leap year', () => {
    expect(nextCycleDueDate(new Date(2026, 0, 31))).toEqual(
      new Date(2026, 1, 28),
    )
  })

  it('clamps Jan 31 to Feb 29 in a leap year', () => {
    expect(nextCycleDueDate(new Date(2028, 0, 31))).toEqual(
      new Date(2028, 1, 29),
    )
  })

  it('clamps Mar 31 to Apr 30 for a 30-day target month', () => {
    expect(nextCycleDueDate(new Date(2026, 2, 31))).toEqual(
      new Date(2026, 3, 30),
    )
  })

  it('rolls Dec 31 over into Jan 31 of the next year', () => {
    expect(nextCycleDueDate(new Date(2026, 11, 31))).toEqual(
      new Date(2027, 0, 31),
    )
  })

  it('advances Feb 28 to Mar 28 rather than snapping to the end of March', () => {
    expect(nextCycleDueDate(new Date(2026, 1, 28))).toEqual(
      new Date(2026, 2, 28),
    )
  })

  // The clamp is permanent: a Jan 31 cuenta drifts to Feb 28 and then stays
  // on the 28th, since the helper only ever reads the previous cycle's day.
  it('keeps the clamped day on subsequent cycles instead of snapping back', () => {
    const february = nextCycleDueDate(new Date(2026, 0, 31))
    expect(nextCycleDueDate(february)).toEqual(new Date(2026, 2, 28))
  })

  it('preserves the time of day of the source date', () => {
    expect(nextCycleDueDate(new Date(2026, 0, 15, 9, 30, 15, 250))).toEqual(
      new Date(2026, 1, 15, 9, 30, 15, 250),
    )
  })

  it('preserves the time of day when the day is clamped', () => {
    expect(nextCycleDueDate(new Date(2026, 0, 31, 23, 59, 59, 999))).toEqual(
      new Date(2026, 1, 28, 23, 59, 59, 999),
    )
  })

  it('does not mutate the date it is given', () => {
    const source = new Date(2026, 0, 31)
    nextCycleDueDate(source)
    expect(source).toEqual(new Date(2026, 0, 31))
  })
})

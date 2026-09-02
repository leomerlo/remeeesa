import { describe, expect, it } from 'vitest'
import { formatMonthLabel, formatShortDate } from './format'

describe('formatShortDate', () => {
  it('includes the day and full year', () => {
    const formatted = formatShortDate(new Date(2026, 8, 10))
    expect(formatted).toContain('10')
    expect(formatted).toContain('2026')
  })

  it('produces different output for different dates', () => {
    expect(formatShortDate(new Date(2026, 0, 1))).not.toBe(
      formatShortDate(new Date(2026, 11, 31)),
    )
  })
})

describe('formatMonthLabel', () => {
  it('capitalizes the month name, es-AR renders it lowercase', () => {
    expect(formatMonthLabel(new Date(2026, 8, 1))).toBe('Septiembre de 2026')
  })

  it('includes the year', () => {
    expect(formatMonthLabel(new Date(2026, 0, 15))).toContain('2026')
  })

  it('is stable across any day within the same month', () => {
    expect(formatMonthLabel(new Date(2026, 8, 1))).toBe(
      formatMonthLabel(new Date(2026, 8, 30)),
    )
  })
})

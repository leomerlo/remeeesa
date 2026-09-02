import { describe, expect, it } from 'vitest'
import { formatShortDate } from './format'

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

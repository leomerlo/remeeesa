import { describe, expect, it } from 'vitest'
import {
  dueDateLabel,
  formatDate,
  formatMonthLabel,
  paidDateLabel,
} from './format'

describe('formatDate', () => {
  it('includes the day and full year', () => {
    const formatted = formatDate(new Date(2026, 8, 10))
    expect(formatted).toContain('10')
    expect(formatted).toContain('2026')
  })

  it('produces different output for different dates', () => {
    expect(formatDate(new Date(2026, 0, 1))).not.toBe(
      formatDate(new Date(2026, 11, 31)),
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

describe('dueDateLabel', () => {
  it('says a bill is still ahead of its date', () => {
    expect(dueDateLabel(new Date(2026, 8, 20), new Date(2026, 8, 4))).toBe(
      'Vence el 20/09/2026',
    )
  })

  it('says a bill has been missed once the day has passed', () => {
    expect(dueDateLabel(new Date(2026, 8, 1), new Date(2026, 8, 4))).toBe(
      'Venció el 01/09/2026',
    )
  })

  it('does not call a bill due today missed', () => {
    // Compared by day, not by instant: a bill due today is still due today
    // at 11pm.
    expect(
      dueDateLabel(new Date(2026, 8, 4, 0, 0), new Date(2026, 8, 4, 23, 30)),
    ).toBe('Vence el 04/09/2026')
  })
})

describe('paidDateLabel', () => {
  it('says when the money left', () => {
    expect(paidDateLabel(new Date(2026, 8, 4))).toBe('Pagado el 04/09/2026')
  })
})

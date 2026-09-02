import { describe, expect, it } from 'vitest'
import {
  parsePendienteDueDate,
  parsePendienteName,
  parseExpectedAmount,
} from './validate'

describe('parsePendienteName', () => {
  it('trims surrounding whitespace', () => {
    expect(parsePendienteName('  Alquiler  ')).toBe('Alquiler')
  })

  it('rejects an empty string', () => {
    expect(() => parsePendienteName('   ')).toThrow(
      'El nombre del pendiente no puede estar vacío',
    )
  })
})

describe('parsePendienteDueDate', () => {
  it('accepts a past date (past dates are allowed for pendientes)', () => {
    const pastDate = new Date(2020, 0, 1)
    expect(parsePendienteDueDate(pastDate)).toBe(pastDate)
  })

  it('accepts a future date', () => {
    const futureDate = new Date(2099, 0, 1)
    expect(parsePendienteDueDate(futureDate)).toBe(futureDate)
  })

  it('rejects an invalid date', () => {
    expect(() => parsePendienteDueDate(new Date(Number.NaN))).toThrow(
      'La fecha del pendiente no es válida',
    )
  })
})

describe('parseExpectedAmount', () => {
  it('maps null and undefined to null', () => {
    expect(parseExpectedAmount(null)).toBeNull()
    expect(parseExpectedAmount(undefined)).toBeNull()
  })

  it('rejects NaN, Infinity, and non-positive values', () => {
    expect(() => parseExpectedAmount(Number.NaN)).toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
    expect(() => parseExpectedAmount(Number.POSITIVE_INFINITY)).toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
    expect(() => parseExpectedAmount(0)).toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
    expect(() => parseExpectedAmount(-1)).toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
  })

  it('rounds to 2 decimal places', () => {
    expect(parseExpectedAmount(10.456)).toBe(10.46)
    expect(parseExpectedAmount(10.454)).toBe(10.45)
  })

  it('rejects a positive value that rounds to zero', () => {
    expect(() => parseExpectedAmount(0.001)).toThrow(
      'El monto esperado del pendiente debe ser un número positivo',
    )
  })
})

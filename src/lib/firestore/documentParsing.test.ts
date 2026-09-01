import { describe, expect, it } from 'vitest'
import { isRecord, parseRequiredString, parseTimestamp } from './documentParsing'

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
  })

  it('rejects null, arrays, and primitives', () => {
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(1)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
  })
})

describe('parseTimestamp', () => {
  it('accepts a valid Date', () => {
    const date = new Date('2024-01-01')
    expect(parseTimestamp(date, 'due_date')).toBe(date)
  })

  it('accepts a Firestore-timestamp-like object with toDate()', () => {
    const date = new Date('2024-01-01')
    expect(parseTimestamp({ toDate: () => date }, 'due_date')).toBe(date)
  })

  it('rejects an invalid Date', () => {
    expect(() => parseTimestamp(new Date(Number.NaN), 'due_date')).toThrow(
      'due_date must be a timestamp',
    )
  })

  it('rejects a toDate() result that is not a valid Date', () => {
    expect(() =>
      parseTimestamp({ toDate: () => 'not a date' }, 'due_date'),
    ).toThrow('due_date must be a timestamp')
  })

  it('rejects values with no toDate() method', () => {
    expect(() => parseTimestamp('2024-01-01', 'due_date')).toThrow(
      'due_date must be a timestamp',
    )
    expect(() => parseTimestamp(null, 'due_date')).toThrow(
      'due_date must be a timestamp',
    )
  })
})

describe('parseRequiredString', () => {
  it('accepts a non-empty string', () => {
    expect(parseRequiredString('hola', 'name')).toBe('hola')
  })

  it('rejects a blank or non-string value', () => {
    expect(() => parseRequiredString('', 'name')).toThrow(
      'name must be a non-empty string',
    )
    expect(() => parseRequiredString('   ', 'name')).toThrow(
      'name must be a non-empty string',
    )
    expect(() => parseRequiredString(undefined, 'name')).toThrow(
      'name must be a non-empty string',
    )
    expect(() => parseRequiredString(42, 'name')).toThrow(
      'name must be a non-empty string',
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  assertExpenseInCurrentMonth,
  parseAuthorDisplayName,
  parseCategoryName,
  parseExpenseDate,
  parseExpenseDateInCurrentMonth,
  parseExpenseName,
  parseExpensePrice,
} from './validate'

describe('parseCategoryName', () => {
  it('rejects an empty string', () => {
    expect(() => parseCategoryName('')).toThrow(
      'El nombre de la categoría no puede estar vacío',
    )
  })
})

describe('parseExpenseName', () => {
  it('rejects an empty string', () => {
    expect(() => parseExpenseName('   ')).toThrow(
      'El nombre del gasto no puede estar vacío',
    )
  })
})

describe('parseExpensePrice', () => {
  it('rejects NaN, Infinity, and non-positive values', () => {
    expect(() => parseExpensePrice(Number.NaN)).toThrow(
      'El precio del gasto debe ser un número positivo',
    )
    expect(() => parseExpensePrice(Number.POSITIVE_INFINITY)).toThrow(
      'El precio del gasto debe ser un número positivo',
    )
    expect(() => parseExpensePrice(0)).toThrow(
      'El precio del gasto debe ser un número positivo',
    )
    expect(() => parseExpensePrice(-1)).toThrow(
      'El precio del gasto debe ser un número positivo',
    )
  })

  it('rounds to 2 decimal places', () => {
    expect(parseExpensePrice(10.456)).toBe(10.46)
    expect(parseExpensePrice(10.454)).toBe(10.45)
  })

  it('rejects a positive value that rounds to zero', () => {
    expect(() => parseExpensePrice(0.001)).toThrow(
      'El precio del gasto debe ser un número positivo',
    )
  })
})

describe('parseAuthorDisplayName', () => {
  it('rejects an empty string', () => {
    expect(() => parseAuthorDisplayName('  ')).toThrow(
      'El nombre del autor no puede estar vacío',
    )
  })
})

describe('parseExpenseDate', () => {
  it('rejects a calendar date after today', () => {
    const now = new Date(2026, 7, 28, 12, 0, 0)
    const tomorrow = new Date(2026, 7, 29, 0, 0, 0)
    expect(() => parseExpenseDate(tomorrow, now)).toThrow(
      'La fecha del gasto no puede ser futura',
    )
  })

  it('allows today and past calendar dates', () => {
    const now = new Date(2026, 7, 28, 12, 0, 0)
    expect(parseExpenseDate(new Date(2026, 7, 28, 23, 0, 0), now)).toEqual(
      new Date(2026, 7, 28, 23, 0, 0),
    )
    expect(parseExpenseDate(new Date(2026, 7, 27), now)).toEqual(
      new Date(2026, 7, 27),
    )
  })

  it('rejects an invalid date', () => {
    expect(() => parseExpenseDate(new Date('not-a-date'))).toThrow(
      'La fecha del gasto no es válida',
    )
  })
})

describe('parseExpenseDateInCurrentMonth', () => {
  it('rejects a calendar date outside the current month', () => {
    const now = new Date(2026, 7, 28, 12, 0, 0)
    expect(() =>
      parseExpenseDateInCurrentMonth(new Date(2026, 6, 31), now),
    ).toThrow('La fecha del gasto debe ser del mes actual')
  })

  it('allows any date within the current month that is not in the future', () => {
    const now = new Date(2026, 7, 28, 12, 0, 0)
    expect(parseExpenseDateInCurrentMonth(new Date(2026, 7, 1), now)).toEqual(
      new Date(2026, 7, 1),
    )
    expect(parseExpenseDateInCurrentMonth(new Date(2026, 7, 28), now)).toEqual(
      new Date(2026, 7, 28),
    )
  })
})

describe('assertExpenseInCurrentMonth', () => {
  it('rejects an expense dated outside the current month', () => {
    const now = new Date(2026, 7, 28, 12, 0, 0)
    expect(() =>
      assertExpenseInCurrentMonth(new Date(2026, 6, 15), now),
    ).toThrow('El gasto no pertenece al mes actual')
  })
})

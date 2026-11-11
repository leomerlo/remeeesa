import { describe, expect, it } from 'vitest'
import { billOwed } from './billOwed'

describe('billOwed', () => {
  it('is the whole figure while nothing has been handed over', () => {
    expect(billOwed({ expectedAmount: 100000 })).toBe(100000)
  })

  it('takes off what has already been handed over', () => {
    expect(billOwed({ expectedAmount: 100000, paidSoFar: 40000 })).toBe(60000)
  })

  it('is unknowable while the figure has not arrived', () => {
    expect(billOwed({ expectedAmount: null, paidSoFar: 40000 })).toBeNull()
  })

  it('is never negative when more was handed over than the bill said', () => {
    expect(billOwed({ expectedAmount: 100000, paidSoFar: 120000 })).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { cuotasOf, resumenIdFor } from './cuotas'

describe('cuotasOf', () => {
  it('rounds each cuota down and lets the last absorb the remainder', () => {
    const amounts = cuotasOf({
      total: 100,
      cuotas: 3,
      purchaseDate: new Date(2026, 8, 15),
    }).map((cuota) => cuota.amount)

    expect(amounts).toEqual([33.33, 33.33, 33.34])
  })

  it('puts a 1-cuota September purchase in October', () => {
    const cuotas = cuotasOf({
      total: 50,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 30),
    })

    expect(cuotas).toEqual([
      { number: 1, amount: 50, monthStart: new Date(2026, 9, 1) },
    ])
  })

  it('puts a 3-cuota September purchase in October, November and December', () => {
    const months = cuotasOf({
      total: 300,
      cuotas: 3,
      purchaseDate: new Date(2026, 8, 1),
    }).map((cuota) => cuota.monthStart)

    expect(months).toEqual([
      new Date(2026, 9, 1),
      new Date(2026, 10, 1),
      new Date(2026, 11, 1),
    ])
  })

  it('rolls a 3-cuota December purchase into January–March of the next year', () => {
    const months = cuotasOf({
      total: 300,
      cuotas: 3,
      purchaseDate: new Date(2026, 11, 20),
    }).map((cuota) => cuota.monthStart)

    expect(months).toEqual([
      new Date(2027, 0, 1),
      new Date(2027, 1, 1),
      new Date(2027, 2, 1),
    ])
  })

  it('sums exactly to a total that is not a whole number of cents per cuota', () => {
    const cuotas = cuotasOf({
      total: 1234.56,
      cuotas: 7,
      purchaseDate: new Date(2026, 0, 1),
    })

    const cents = cuotas.reduce(
      (sum, cuota) => sum + Math.round(cuota.amount * 100),
      0,
    )
    expect(cents).toBe(123456)
  })
})

describe('resumenIdFor', () => {
  it('keys the Resumen by card and zero-padded month', () => {
    expect(resumenIdFor('card-1', new Date(2027, 0, 1))).toBe('card-1_2027-01')
  })
})

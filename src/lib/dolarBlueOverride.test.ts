import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDolarBlueOverride,
  readDolarBlueOverride,
  writeDolarBlueOverride,
} from './dolarBlueOverride'

afterEach(() => {
  localStorage.clear()
})

describe('the dólar blue override', () => {
  it('is absent until a rate is set', () => {
    expect(readDolarBlueOverride()).toBeNull()
  })

  it('reads back the rate that was set', () => {
    writeDolarBlueOverride(1485.5)

    expect(readDolarBlueOverride()).toBe(1485.5)
  })

  it('goes back to nothing once cleared', () => {
    writeDolarBlueOverride(1485)
    clearDolarBlueOverride()

    expect(readDolarBlueOverride()).toBeNull()
  })

  // A zero would turn every conversion into Infinity, and a negative into a
  // sign error -- neither is worth storing, and neither is worth reading.
  it('refuses a rate that cannot divide', () => {
    writeDolarBlueOverride(0)
    expect(readDolarBlueOverride()).toBeNull()

    writeDolarBlueOverride(-100)
    expect(readDolarBlueOverride()).toBeNull()
  })

  it('reads a corrupt value as no override rather than throwing', () => {
    localStorage.setItem('remeeesa.dolar_blue_override', 'mil quinientos')

    expect(readDolarBlueOverride()).toBeNull()
  })
})

// One stored rate per side: somebody is quoted a number for the
// operation they are actually doing, and that number says nothing about
// the other direction.
describe('a rate per side of the counter', () => {
  it('keeps the two apart', () => {
    writeDolarBlueOverride(1540, 'compra')
    writeDolarBlueOverride(1600, 'venta')

    expect(readDolarBlueOverride('compra')).toBe(1540)
    expect(readDolarBlueOverride('venta')).toBe(1600)
  })

  it('clears one without touching the other', () => {
    writeDolarBlueOverride(1540, 'compra')
    writeDolarBlueOverride(1600, 'venta')

    clearDolarBlueOverride('compra')

    expect(readDolarBlueOverride('compra')).toBeNull()
    expect(readDolarBlueOverride('venta')).toBe(1600)
  })

  // A rate typed before the two sides were told apart was the venta one,
  // because that is the only rate the converter ever used.
  it('reads a rate stored before the sides existed as the venta one', () => {
    localStorage.setItem('remeeesa.dolar_blue_override', '1480')

    expect(readDolarBlueOverride('venta')).toBe(1480)
    expect(readDolarBlueOverride('compra')).toBeNull()
  })
})

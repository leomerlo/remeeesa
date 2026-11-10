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

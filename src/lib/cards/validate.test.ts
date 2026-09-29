import { describe, expect, it } from 'vitest'
import { parseCardName } from './validate'

describe('parseCardName', () => {
  it('trims surrounding whitespace', () => {
    expect(parseCardName('  Visa  ')).toBe('Visa')
  })

  it('rejects a blank name', () => {
    expect(() => parseCardName('   ')).toThrow(
      'Ingresá un nombre para la tarjeta',
    )
  })
})

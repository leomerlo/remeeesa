import { describe, expect, it } from 'vitest'
import { cuentasQueryKey } from './queryKeys'

describe('cuentas query keys', () => {
  it('scopes cuentas to the household', () => {
    expect(cuentasQueryKey({ householdId: 'hh-1' })).toEqual([
      'cuentas',
      'hh-1',
    ])
  })
})

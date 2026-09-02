import { describe, expect, it } from 'vitest'
import { pendientesQueryKey } from './queryKeys'

describe('pendientes query keys', () => {
  it('scopes pendientes to the household', () => {
    expect(pendientesQueryKey({ householdId: 'hh-1' })).toEqual([
      'pendientes',
      'hh-1',
    ])
  })
})

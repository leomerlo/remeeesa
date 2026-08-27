import { describe, expect, it } from 'vitest'
import { createQueryClient } from './queryClient'

describe('createQueryClient', () => {
  it('returns a distinct client per call so caches stay isolated', () => {
    const first = createQueryClient()
    const second = createQueryClient()

    expect(first).not.toBe(second)
    expect(first.getQueryCache()).not.toBe(second.getQueryCache())
  })
})

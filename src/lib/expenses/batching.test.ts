import { describe, expect, it } from 'vitest'
import { chunkForWriteBatch, WRITE_BATCH_LIMIT } from './batching'

describe('chunkForWriteBatch', () => {
  it('leaves a batch-sized run in one chunk', () => {
    const items = Array.from({ length: WRITE_BATCH_LIMIT }, (_, i) => i)

    expect(chunkForWriteBatch(items)).toHaveLength(1)
  })

  // The case the whole helper exists for: a household with more references
  // than Firestore lets one batch touch. Splitting it wrong is invisible until
  // a rename silently drops everything past the limit.
  it('splits a run longer than one batch, keeping every item exactly once', () => {
    const items = Array.from({ length: WRITE_BATCH_LIMIT * 2 + 7 }, (_, i) => i)

    const chunks = chunkForWriteBatch(items)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toHaveLength(WRITE_BATCH_LIMIT)
    expect(chunks[1]).toHaveLength(WRITE_BATCH_LIMIT)
    expect(chunks[2]).toHaveLength(7)
    expect(chunks.flat()).toEqual(items)
  })

  it('stays under Firestore’s own 500-write cap', () => {
    expect(WRITE_BATCH_LIMIT).toBeLessThan(500)
  })

  it('returns nothing to commit for an empty run', () => {
    expect(chunkForWriteBatch([])).toEqual([])
  })

  it('rejects a nonsensical batch size instead of looping forever', () => {
    expect(() => chunkForWriteBatch([1, 2], 0)).toThrow('entero positivo')
  })
})

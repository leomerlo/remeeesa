import { describe, expect, it } from 'vitest'
import { SANDBOX_STORAGE_KEY, createSandbox } from './sandbox'

function fakeStore(initial: Record<string, string> = {}): {
  readonly store: Pick<Storage, 'getItem' | 'setItem'>
  readonly data: Record<string, string>
} {
  const data: Record<string, string> = { ...initial }
  return {
    data,
    store: {
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => {
        data[key] = value
      },
    },
  }
}

describe('the beta sandbox ledger', () => {
  it('owns only what it was told it made', () => {
    const sandbox = createSandbox(null)
    sandbox.claim('expense', 'mine')

    expect(sandbox.owns('expense', 'mine')).toBe(true)
    expect(sandbox.owns('expense', 'theirs')).toBe(false)
    // Kinds do not leak into each other: a category and a gasto can share
    // an id without sharing permission.
    expect(sandbox.owns('category', 'mine')).toBe(false)
  })

  it('remembers across a reload, so yesterday’s test rows can still be cleaned up', () => {
    const { store, data } = fakeStore()
    const first = createSandbox(store)
    first.claim('pendiente', 'luz-de-prueba')
    expect(data[SANDBOX_STORAGE_KEY]).toContain('luz-de-prueba')

    const afterReload = createSandbox(store)
    expect(afterReload.owns('pendiente', 'luz-de-prueba')).toBe(true)
  })

  it('forgets a row it deleted, and counts what is left', () => {
    const sandbox = createSandbox(null)
    sandbox.claim('expense', 'a')
    sandbox.claim('card', 'b')
    expect(sandbox.size()).toBe(2)

    sandbox.forget('expense', 'a')
    expect(sandbox.size()).toBe(1)
    expect(sandbox.owns('expense', 'a')).toBe(false)
    expect(sandbox.ledger().card).toEqual(['b'])
  })

  it('keeps working when storage refuses, claiming nothing it cannot keep', () => {
    const angry: Pick<Storage, 'getItem' | 'setItem'> = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const sandbox = createSandbox(angry)
    sandbox.claim('expense', 'a')

    // The tab still knows what it wrote; only the memory of it across a
    // reload is gone, which is not an error anybody needs to see.
    expect(sandbox.owns('expense', 'a')).toBe(true)
  })

  it('ignores a stored ledger that has been scribbled on', () => {
    const { store } = fakeStore({
      [SANDBOX_STORAGE_KEY]: '{"expense":[1,"ok"],"card":"nope"}',
    })
    const sandbox = createSandbox(store)

    expect(sandbox.owns('expense', 'ok')).toBe(true)
    expect(sandbox.ledger().card).toEqual([])
  })
})

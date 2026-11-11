import { afterEach, describe, expect, it, vi } from 'vitest'
import { arsToUsd, fetchDolarBlue, fetchDolarBlueRate } from './dolarBlue'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dolarBlue', () => {
  it('reads the venta rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ compra: 1540, venta: 1560 }),
      }),
    )
    await expect(fetchDolarBlueRate()).resolves.toBe(1560)
  })

  it('rejects a failed or malformed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )
    await expect(fetchDolarBlueRate()).rejects.toThrow()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    )
    await expect(fetchDolarBlueRate()).rejects.toThrow()
  })

  it('converts pesos to dollars', () => {
    expect(arsToUsd(15600, 1560)).toBe(10)
  })
})

// Both sides of the counter, because which one applies is decided by
// what the household is doing: compra is what the cueva pays for the
// dollars it is handed, venta what it charges for the ones it hands
// over. One figure cannot answer both questions.
describe('both sides of the counter', () => {
  it('reads the two rates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ compra: 1540, venta: 1560 }),
      }),
    )
    await expect(fetchDolarBlue()).resolves.toEqual({
      compra: 1540,
      venta: 1560,
    })
  })

  it('refuses a response missing either of them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ venta: 1560 }),
      }),
    )
    await expect(fetchDolarBlue()).rejects.toThrow()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ compra: 1540 }),
      }),
    )
    await expect(fetchDolarBlue()).rejects.toThrow()
  })
})

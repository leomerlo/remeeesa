import { afterEach, describe, expect, it, vi } from 'vitest'
import { arsToUsd, fetchDolarBlueRate } from './dolarBlue'

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

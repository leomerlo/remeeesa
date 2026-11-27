import { beforeEach, describe, expect, it } from 'vitest'
import type { Card as PaymentMethod } from '@/lib/cards'
import {
  cardsNeedingCierre,
  cierreAsked,
  markCierreAsked,
} from './cierreReminder'

const NOW = new Date(2026, 11, 3, 12)

function card(
  name: string,
  kind: PaymentMethod['kind'],
  closings: Record<string, number>,
): PaymentMethod {
  return { id: name, name, kind, closings } as unknown as PaymentMethod
}

describe('which cards still need a cierre this month', () => {
  it('asks about a credit card nobody has confirmed this month', () => {
    const visa = card('Visa', 'credito', { '2026-11': 26 })
    expect(
      cardsNeedingCierre({ methods: [visa], now: NOW }).map((one) => one.name),
    ).toEqual(['Visa'])
  })

  it('leaves alone one that was already confirmed for this month', () => {
    const visa = card('Visa', 'credito', { '2026-11': 26, '2026-12': 24 })
    expect(cardsNeedingCierre({ methods: [visa], now: NOW })).toEqual([])
  })

  it('never asks about anything that is not a credit card', () => {
    const debito = card('Débito', 'debito', {})
    const efectivo = card('Efectivo', 'efectivo', {})
    expect(
      cardsNeedingCierre({ methods: [debito, efectivo], now: NOW }),
    ).toEqual([])
  })
})

describe('being asked once a month', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stops asking for the month that was dismissed', () => {
    expect(cierreAsked('2026-12')).toBe(false)
    markCierreAsked('2026-12')
    expect(cierreAsked('2026-12')).toBe(true)
  })

  it('asks again the next month', () => {
    markCierreAsked('2026-12')
    expect(cierreAsked('2027-01')).toBe(false)
  })
})

const DOLAR_BLUE_URL = 'https://dolarapi.com/v1/dolares/blue'

// The two sides of the counter, and which one applies is decided by what
// the household is doing, not by the app:
//
// - `compra` is what the cueva PAYS for a dollar, and it is the lower of
//   the two. It applies when the household is handing dollars over.
// - `venta` is what the cueva CHARGES for a dollar, and it is the higher.
//   It applies when the household is handing pesos over to get dollars.
//
// Quoting one of them for both questions is wrong by the spread, which on
// the blue is not small. Per direct feedback: "si yo tengo dólares y voy a
// la casa de cambio, me dan el más bajo; si tengo pesos y los quiero pagar
// en dólares, me dan el más alto".
export type DolarSide = 'compra' | 'venta'

export type DolarBlue = {
  readonly compra: number
  readonly venta: number
}

function rateOf(value: unknown, field: string): number {
  if (typeof value !== 'number' || !(value > 0)) {
    throw new Error(`Dólar blue response has no valid ${field}`)
  }
  return value
}

async function read(): Promise<{
  readonly compra?: unknown
  readonly venta?: unknown
}> {
  const response = await fetch(DOLAR_BLUE_URL)
  if (!response.ok) {
    throw new Error(`Dólar blue request failed: ${String(response.status)}`)
  }
  return (await response.json()) as { compra?: unknown; venta?: unknown }
}

export async function fetchDolarBlue(): Promise<DolarBlue> {
  const { compra, venta } = await read()
  return {
    compra: rateOf(compra, 'compra'),
    venta: rateOf(venta, 'venta'),
  }
}

// Just the "venta" side, which is what the v1's converter asks for: it has
// one rate and one direction, and this is the one it always used.
//
// It validates that side alone rather than going through fetchDolarBlue,
// so the app that is the way back cannot start failing over a field it
// never read. Per the same rule the two entries were split under.
export async function fetchDolarBlueRate(): Promise<number> {
  return rateOf((await read()).venta, 'venta')
}

export function arsToUsd(ars: number, rate: number): number {
  return ars / rate
}

export function usdToArs(usd: number, rate: number): number {
  return usd * rate
}

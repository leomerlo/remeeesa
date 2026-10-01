const DOLAR_BLUE_URL = 'https://dolarapi.com/v1/dolares/blue'

// The "venta" side: what it costs to buy a dollar, which is the rate that
// answers "how many dollars is this many pesos".
export async function fetchDolarBlueRate(): Promise<number> {
  const response = await fetch(DOLAR_BLUE_URL)
  if (!response.ok) {
    throw new Error(`Dólar blue request failed: ${String(response.status)}`)
  }
  const { venta } = (await response.json()) as { venta?: unknown }
  if (typeof venta !== 'number' || !(venta > 0)) {
    throw new Error('Dólar blue response has no valid rate')
  }
  return venta
}

export function arsToUsd(ars: number, rate: number): number {
  return ars / rate
}

export function usdToArs(usd: number, rate: number): number {
  return usd * rate
}

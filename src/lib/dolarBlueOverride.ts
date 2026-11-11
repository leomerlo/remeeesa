import type { DolarSide } from './dolarBlue'

// One stored rate per side of the counter: somebody is quoted a number
// for the operation they are actually doing, and that number says nothing
// about the other direction. The "venta" side keeps the original key, so
// a rate typed before the two sides were told apart is still there -- the
// converter only ever used venta, which is what that number was.
const STORAGE_KEY = 'remeeesa.dolar_blue_override'
const COMPRA_KEY = 'remeeesa.dolar_blue_override.compra'

function keyFor(side: DolarSide): string {
  return side === 'compra' ? COMPRA_KEY : STORAGE_KEY
}

// The rate the household actually got, when it is not the one the market
// publishes. The converter fetches dolarapi's "venta", which is a quote --
// the number that matters is what the cueva paid, and that is routinely a
// few percent off. Per direct feedback: the published figure is the default,
// never the last word.
//
// On the device that typed it, not in Firestore: it is a rate someone was
// quoted at a counter, it goes stale in days, and pushing it at the other
// member as a fact about the household would be worse than leaving them the
// market's own number.
function canUseLocalStorage(): boolean {
  try {
    return (
      typeof localStorage !== 'undefined' &&
      typeof localStorage.getItem === 'function' &&
      typeof localStorage.setItem === 'function'
    )
  } catch {
    return false
  }
}

// null when nothing has been set, or when what is stored is not a usable
// rate -- a zero or a negative would divide the converter into nonsense.
export function readDolarBlueOverride(
  side: DolarSide = 'venta',
): number | null {
  if (!canUseLocalStorage()) {
    return null
  }
  try {
    const raw = localStorage.getItem(keyFor(side))
    if (raw === null) {
      return null
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeDolarBlueOverride(
  rate: number,
  side: DolarSide = 'venta',
): void {
  if (!canUseLocalStorage() || !Number.isFinite(rate) || rate <= 0) {
    return
  }
  try {
    localStorage.setItem(keyFor(side), String(rate))
  } catch {
    // A full or blocked store is not worth interrupting anyone over.
  }
}

export function clearDolarBlueOverride(side: DolarSide = 'venta'): void {
  if (!canUseLocalStorage()) {
    return
  }
  try {
    localStorage.removeItem(keyFor(side))
  } catch {
    // Same.
  }
}

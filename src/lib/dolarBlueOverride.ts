const STORAGE_KEY = 'remeeesa.dolar_blue_override'

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
export function readDolarBlueOverride(): number | null {
  if (!canUseLocalStorage()) {
    return null
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) {
      return null
    }
    const parsed = Number(raw)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    return null
  }
}

export function writeDolarBlueOverride(rate: number): void {
  if (!canUseLocalStorage() || !Number.isFinite(rate) || rate <= 0) {
    return
  }
  try {
    localStorage.setItem(STORAGE_KEY, String(rate))
  } catch {
    // A full or blocked store is not worth interrupting anyone over.
  }
}

export function clearDolarBlueOverride(): void {
  if (!canUseLocalStorage()) {
    return
  }
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Same.
  }
}

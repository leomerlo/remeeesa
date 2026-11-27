import { closingMonthKey } from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'

// Whether to ask the household what day their cards closed this month.
//
// The cierre carries forward, so the app would never need asking again --
// except that the day itself moves: "un día te cierra el 26, otro el 29 y
// es un caos". So once a month, for each credit card whose cierre has not
// been confirmed for this month, it asks. Dismissing it is per month, so
// saying "después" does not silence it forever.
//
// localStorage, like the welcome: this is a fact about this screen, not
// about the household, and it is not worth a field in Firestore and a rule
// to go with it. A phone with site data blocked is simply never nagged.
function key(month: string): string {
  return `remeeesa.cierre_asked.${month}`
}

export function cierreAsked(month: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(key(month)) === '1'
  } catch {
    return true
  }
}

export function markCierreAsked(month: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key(month), '1')
  } catch {
    // Nothing to do: the note closes either way.
  }
}

// The credit cards whose cierre nobody has confirmed for this month. A day
// inherited from an earlier month does not count: it is exactly the thing
// that may have changed.
export function cardsNeedingCierre(input: {
  readonly methods: readonly PaymentMethod[]
  readonly now: Date
}): readonly PaymentMethod[] {
  const month = closingMonthKey(input.now)
  return input.methods.filter(
    (method) =>
      method.kind === 'credito' &&
      !Object.prototype.hasOwnProperty.call(method.closings, month),
  )
}

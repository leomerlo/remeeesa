// Whether this browser has already been told that the app was redesigned.
//
// localStorage, not the household's database: this is not a fact about the
// house, it is a fact about this screen, and the beta writes nothing into
// the real data it was not asked to write. The trade that buys: a second
// phone, or the same phone with its site data cleared, is welcomed again.
// The alternative is a field in Firestore and a rule to go with it, for a
// modal that is shown once.
const KEY = 'remeeesa.beta_welcome_seen'

export function welcomeSeen(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(KEY) === '1'
  } catch {
    // A browser with site data blocked cannot remember the answer, so the
    // welcome would come back on every single load. Never showing it is
    // the lesser of the two.
    return true
  }
}

export function markWelcomeSeen(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY, '1')
  } catch {
    // Nothing to do about it: the modal closes either way.
  }
}

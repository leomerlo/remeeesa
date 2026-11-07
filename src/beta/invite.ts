// The invite code, on its way from wherever it arrived to the moment it can
// be spent.
//
// It cannot be spent when it arrives: joining a household needs somebody to
// join as, and the person pasting a code usually has no account yet. So it
// waits -- through the sign-up, through the mail-and-password round trip,
// through a reload if creating the account causes one. sessionStorage, not
// localStorage: a code is for one way in, not forever, and it should not
// still be sitting there next week.

const KEY = 'remeeesa.beta.invite.v1'

// Every one of these can throw or come back empty -- a private window, site
// data cleared, a browser that refuses storage -- and none of it is worth
// showing anybody: the worst case is that somebody pastes the code again.
export function heldInvite(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const held = sessionStorage.getItem(KEY)
    return held === null || held === '' ? null : held
  } catch {
    return null
  }
}

export function holdInvite(token: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return
    if (token === null) {
      sessionStorage.removeItem(KEY)
      return
    }
    sessionStorage.setItem(KEY, token)
  } catch {
    // Kept in the page's own state anyway, which is enough for one sitting.
  }
}

// What somebody pastes into "entrá con el código" is whatever they were
// sent: the code, the whole link, or the link with a space at the end. Also
// what the address holds when they opened the link itself.
export function tokenFromPaste(paste: string): string {
  const trimmed = paste.trim()
  if (trimmed === '') return ''
  const withoutQuery = trimmed.split('?')[0] ?? ''
  // The beta's own link carries the code after the hash
  // (…/beta.html#/unirme/<code>), so the fragment is where to look when
  // there is one.
  const at = withoutQuery.indexOf('#')
  const fragment = at === -1 ? '' : withoutQuery.slice(at + 1)
  const path = fragment.trim() === '' ? withoutQuery : fragment
  const pieces = path.split('/').filter((piece) => piece !== '')
  // Left exactly as it is: the code is a uuid, dashes and all, and tidying
  // it up would be tidying away part of the code.
  return pieces[pieces.length - 1] ?? ''
}

// The link an inviter sends. The beta is a second entry and routes on the
// hash, so this is the shape that opens the beta and carries the code into
// it -- no server rewrite to remember.
export function inviteLink(input: {
  readonly origin: string
  readonly token: string
}): string {
  return `${input.origin}/beta.html#/unirme/${input.token}`
}

// A link somebody opened, read and put away before React starts.
//
// Done here, outside the app, on purpose: the code has to come out of the
// address bar (a code left sitting there is spent again on every reload),
// and doing that from inside a component means setting state from an effect
// and rendering twice over. One function, called once by the entry point,
// and by the time anything renders the code is held and the address is
// clean.
export function claimInviteFromAddress(location: {
  hash: string
  pathname: string
}): string | null {
  const hash = location.hash.replace(/^#/, '')
  if (!hash.startsWith('/unirme/')) return null
  const token = tokenFromPaste(hash)
  if (token === '') return null
  holdInvite(token)
  try {
    window.history.replaceState(null, '', `${location.pathname}#/`)
  } catch {
    // An address that will not be rewritten is cosmetic: the code is held.
  }
  return token
}

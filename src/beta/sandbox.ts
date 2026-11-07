// What the beta made itself.
//
// The standing rule for this app is that the beta runs against the real
// household and must not touch a single thing that was already in it. But a
// form that cannot be submitted is not a form, so the beta is allowed to
// invent its own data -- today's date, its own rows -- edit that, and delete
// it afterwards. This is the list of what it invented, and it is the whole
// basis for telling the two apart: a row in here can be changed and deleted,
// and a row that is not in here cannot be touched at all.
//
// It has to survive a reload. Otherwise the test rows left over from this
// morning would be indistinguishable from the household's real ones by the
// afternoon -- unreachable by the cleanup and un-deletable by hand, which is
// the exact mess this is meant to prevent. So it is kept in localStorage,
// with the in-memory set as the source of truth while the tab is open.

// A household and a membership are in here for a different reason than the
// rest. The beta can set up a brand-new house -- that is the whole point of
// the onboarding -- and the house it sets up is its own to name, budget and
// walk away from, while the house Flor and Leo actually live in is not. So
// these two kinds are about permission rather than cleanup: the household
// cannot be deleted at all (the v1 has no such call, and a household with no
// members is simply unreachable), and the membership can, by leaving.
export type SandboxKind =
  | 'expense'
  | 'pendiente'
  | 'category'
  | 'card'
  | 'purchase'
  | 'household'
  | 'membership'

export const SANDBOX_KINDS: readonly SandboxKind[] = [
  'expense',
  'pendiente',
  'category',
  'card',
  'purchase',
  'household',
  'membership',
]

export type SandboxLedger = Readonly<Record<SandboxKind, readonly string[]>>

export type Sandbox = {
  // May the beta write this row? Everything it invented, and -- on the demo
  // page, where the whole household is invented -- everything there is.
  owns(kind: SandboxKind, id: string): boolean
  // Did the beta make this row up? What the «Prueba» tag is drawn from. The
  // same question as owns() on the real household and a different one on the
  // demo, where nothing is anybody's real data and tagging every row would
  // say nothing.
  invented(kind: SandboxKind, id: string): boolean
  claim(kind: SandboxKind, id: string): void
  forget(kind: SandboxKind, id: string): void
  ledger(): SandboxLedger
  // How many rows the beta is holding, over every kind. Zero is the
  // household as it was.
  size(): number
}

// One key, not one per household: a Firestore id is unique on its own, and
// this is a local note of what this browser's beta has written -- not a
// second copy of the household.
export const SANDBOX_STORAGE_KEY = 'remeeesa.beta.sandbox.v1'

type Store = Pick<Storage, 'getItem' | 'setItem'>

// Any of these can throw or come back empty -- a private window, cleared
// site data, a browser that refuses storage -- and none of that is an error
// worth showing anybody. The session still works; only the memory of what
// was written yesterday is gone.
function browserStore(): Store | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

function read(store: Store | null): SandboxLedger {
  const empty = blank()
  if (store === null) return empty
  try {
    const raw = store.getItem(SANDBOX_STORAGE_KEY)
    if (raw === null) return empty
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return empty
    const record = parsed as Record<string, unknown>
    const out: Record<SandboxKind, readonly string[]> = blank()
    for (const kind of SANDBOX_KINDS) {
      const value = record[kind]
      out[kind] = Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === 'string')
        : []
    }
    return out
  } catch {
    return empty
  }
}

function blank(): Record<SandboxKind, readonly string[]> {
  return {
    expense: [],
    pendiente: [],
    category: [],
    card: [],
    purchase: [],
    household: [],
    membership: [],
  }
}

export function createSandbox(store: Store | null = browserStore()): Sandbox {
  const held = new Map<SandboxKind, Set<string>>()
  const stored = read(store)
  for (const kind of SANDBOX_KINDS) {
    held.set(kind, new Set(stored[kind]))
  }

  const setOf = (kind: SandboxKind): Set<string> => {
    const existing = held.get(kind)
    if (existing !== undefined) return existing
    const made = new Set<string>()
    held.set(kind, made)
    return made
  }

  const ledger = (): SandboxLedger => {
    const out: Record<SandboxKind, readonly string[]> = blank()
    for (const kind of SANDBOX_KINDS) {
      out[kind] = [...setOf(kind)]
    }
    return out
  }

  const persist = (): void => {
    if (store === null) return
    try {
      store.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(ledger()))
    } catch {
      // Out of quota or refused: the tab keeps working off the set in
      // memory, and tomorrow it will not remember. Nothing to say.
    }
  }

  return {
    owns(kind, id) {
      return setOf(kind).has(id)
    },
    invented(kind, id) {
      return setOf(kind).has(id)
    },
    claim(kind, id) {
      if (id === '') return
      setOf(kind).add(id)
      persist()
    },
    forget(kind, id) {
      if (setOf(kind).delete(id)) persist()
    },
    ledger,
    size() {
      return SANDBOX_KINDS.reduce((total, kind) => total + setOf(kind).size, 0)
    },
  }
}

// The demo page's sandbox: the household it runs on was invented wholesale
// by the seed and is thrown away on reload, so there is nothing in it to
// protect and every form should work end to end. Nothing is claimed and
// nothing is tagged -- there is no cleanup to do and no real data to tell
// the test rows apart from.
export function createOpenSandbox(): Sandbox {
  return {
    owns: () => true,
    invented: () => false,
    claim: () => {},
    forget: () => {},
    ledger: blank,
    size: () => 0,
  }
}

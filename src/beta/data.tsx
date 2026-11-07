import { createContext, useContext, useMemo } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { useHouseholdMembership } from '@/lib/households'
import { useFirebase } from '@/lib/firebaseContext'
import { readOnlyDb } from './readOnlyDb'

export type BetaSession = {
  // undefined while Firebase is still restoring the session, null when
  // nobody is signed in.
  readonly userId: string | null | undefined
  readonly householdId: string | null | undefined
  readonly displayName: string | null
  readonly db: HouseholdsDb
}

// Set only by the beta's own demo page, which runs the whole interface on
// the seeded in-memory household instead of Firestore. Unset everywhere
// else, which is what makes the line below the only place a real database
// is built. It is still wrapped in the read-only guard: the demo is where
// a write that should not exist would be easiest to miss.
const InjectedDb = createContext<HouseholdsDb | null>(null)

export function BetaDbProvider({
  db,
  children,
}: {
  readonly db: HouseholdsDb
  readonly children: ReactNode
}): ReactElement {
  const guarded = useMemo(() => readOnlyDb(db), [db])
  return <InjectedDb.Provider value={guarded}>{children}</InjectedDb.Provider>
}

// The one place the beta gets at the household, and the only place its
// database is built -- so the read-only guard cannot be gone around by
// reaching for createFirestoreHouseholdsDb somewhere else.
export function useBetaSession(): BetaSession {
  const firebase = useFirebase()
  const injected = useContext(InjectedDb)
  const live = useMemo(
    () => readOnlyDb(createFirestoreHouseholdsDb(firebase.db)),
    [firebase.db],
  )
  const db = injected ?? live
  const { currentUserId, membership } = useHouseholdMembership({
    householdsDb: db,
  })

  return {
    userId: currentUserId,
    householdId:
      membership === undefined ? undefined : (membership?.householdId ?? null),
    displayName: membership?.displayName ?? null,
    db,
  }
}

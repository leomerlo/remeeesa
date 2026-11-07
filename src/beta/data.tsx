import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { useHouseholdMembership } from '@/lib/households'
import { useFirebase } from '@/lib/firebaseContext'
import { createOpenSandbox, createSandbox } from './sandbox'
import type { Sandbox } from './sandbox'
import { sandboxDb } from './sandboxDb'

export type BetaSession = {
  // undefined while Firebase is still restoring the session, null when
  // nobody is signed in.
  readonly userId: string | null | undefined
  readonly householdId: string | null | undefined
  readonly displayName: string | null
  readonly db: HouseholdsDb
  // What this browser's beta has written itself, and the only thing it is
  // allowed to change or delete. See sandbox.ts.
  readonly sandbox: Sandbox
  // Called once, by the onboarding, with the house it has just set up. The
  // membership underneath is read once per signed-in user and nothing about
  // the user changed, so without this the app would sit on the last step of
  // the onboarding looking at a household it had already created.
  adopt(householdId: string): void
}

// Set only by the beta's own demo page, which runs the whole interface on
// the seeded in-memory household instead of Firestore. Unset everywhere
// else, which is what makes the line below the only place a real database
// is built. It is still wrapped in the same guard: the demo is where a
// write that should not exist would be easiest to miss, and it is also
// where the guard itself gets exercised by hand.
const InjectedDb = createContext<HouseholdsDb | null>(null)
const InjectedSandbox = createContext<Sandbox | null>(null)

export function BetaDbProvider({
  db,
  children,
}: {
  readonly db: HouseholdsDb
  readonly children: ReactNode
}): ReactElement {
  // The demo household is invented from end to end by the seed, so all of
  // it is the beta's to write: that is what makes the demo a place to try
  // every form. The guard is still in the way on the path that matters --
  // the one below, against the real Firestore.
  const sandbox = useMemo(() => createOpenSandbox(), [])
  const guarded = useMemo(() => sandboxDb(db, sandbox), [db, sandbox])
  return (
    <InjectedSandbox.Provider value={sandbox}>
      <InjectedDb.Provider value={guarded}>{children}</InjectedDb.Provider>
    </InjectedSandbox.Provider>
  )
}

// The one place the beta gets at the household, and the only place its
// database is built -- so the read-only guard cannot be gone around by
// reaching for createFirestoreHouseholdsDb somewhere else.
export function useBetaSession(): BetaSession {
  const firebase = useFirebase()
  const injected = useContext(InjectedDb)
  const injectedSandbox = useContext(InjectedSandbox)
  const own = useMemo(() => createSandbox(), [])
  const sandbox = injectedSandbox ?? own
  const live = useMemo(
    () => sandboxDb(createFirestoreHouseholdsDb(firebase.db), sandbox),
    [firebase.db, sandbox],
  )
  const db = injected ?? live
  const { currentUserId, membership } = useHouseholdMembership({
    householdsDb: db,
  })
  const [adopted, setAdopted] = useState<string | null>(null)

  return {
    userId: currentUserId,
    householdId:
      adopted ??
      (membership === undefined
        ? undefined
        : (membership?.householdId ?? null)),
    displayName: membership?.displayName ?? null,
    db,
    sandbox,
    adopt: setAdopted,
  }
}

// The household's name on its own, for the desktop bar, which sits outside
// every screen and so cannot read it from any screen's query. One small
// document, under its own key, so the bar does not wait on whatever else a
// screen happens to be fetching.
export function useHouseholdName(session: BetaSession): string | undefined {
  const householdId = session.householdId ?? null
  const query = useQuery({
    queryKey: ['beta', 'household-name', householdId],
    enabled: householdId !== null,
    queryFn: async () => {
      const household = await session.db.getHousehold(householdId as string)
      return household.name
    },
  })
  return query.data
}

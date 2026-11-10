import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { useHouseholdMembership } from '@/lib/households'
import { useFirebase } from '@/lib/firebaseContext'

export type BetaSession = {
  // undefined while Firebase is still restoring the session, null when
  // nobody is signed in.
  readonly userId: string | null | undefined
  readonly householdId: string | null | undefined
  readonly displayName: string | null
  readonly db: HouseholdsDb
  // Called once, by the onboarding, with the house it has just set up. The
  // membership underneath is read once per signed-in user and nothing about
  // the user changed, so without this the app would sit on the last step of
  // the onboarding looking at a household it had already created.
  adopt(householdId: string): void
  // Same idea, for your own name: the membership underneath is read once
  // per signed-in user, so renaming yourself would otherwise keep greeting
  // you by the old name until the next reload.
  rename(displayName: string): void
}

// Set only by the beta's own demo page, which runs the whole interface on
// the seeded in-memory household instead of Firestore. Unset everywhere
// else, which is what makes the line below the only place a real database
// is built.
const InjectedDb = createContext<HouseholdsDb | null>(null)

export function BetaDbProvider({
  db,
  children,
}: {
  readonly db: HouseholdsDb
  readonly children: ReactNode
}): ReactElement {
  return <InjectedDb.Provider value={db}>{children}</InjectedDb.Provider>
}

// The one place the beta gets at the household, and the only place its
// database is built.
//
// It writes, with nothing in the way. There was a guard here that let the
// beta change only the rows it had invented itself; it is gone, on Flor's
// word: "hacé la funcionalidad en mi base... yo cuando agrego, edito o
// elimino, lo hago a conciencia." The app is the app. The rule that
// replaced the guard is about who presses the buttons, which is not
// something code can enforce and does not belong in it.
export function useBetaSession(): BetaSession {
  const firebase = useFirebase()
  const injected = useContext(InjectedDb)
  const live = useMemo(
    () => createFirestoreHouseholdsDb(firebase.db),
    [firebase.db],
  )
  const db = injected ?? live
  const { currentUserId, membership } = useHouseholdMembership({
    householdsDb: db,
  })
  const [adopted, setAdopted] = useState<string | null>(null)
  const [renamed, setRenamed] = useState<string | null>(null)

  return {
    userId: currentUserId,
    householdId:
      adopted ??
      (membership === undefined
        ? undefined
        : (membership?.householdId ?? null)),
    displayName: renamed ?? membership?.displayName ?? null,
    db,
    adopt: setAdopted,
    rename: setRenamed,
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

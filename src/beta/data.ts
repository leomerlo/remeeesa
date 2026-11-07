import { useMemo } from 'react'
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

// The one place the beta gets at the household, and the only place its
// database is built -- so the read-only guard cannot be gone around by
// reaching for createFirestoreHouseholdsDb somewhere else.
export function useBetaSession(): BetaSession {
  const firebase = useFirebase()
  const db = useMemo(
    () => readOnlyDb(createFirestoreHouseholdsDb(firebase.db)),
    [firebase.db],
  )
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

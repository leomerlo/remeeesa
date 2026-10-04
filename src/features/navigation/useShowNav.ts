import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getMembership } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'

export type UseShowNavInput = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

// Shared by AppShell (the nav) and AppHeader (the persistent top bar) --
// both need the exact same "is there a signed-in member with a household to
// show a page for" answer, so they pop in and out together rather than one
// appearing a tick before the other. AppHeader also needs the membership
// itself, to name the household it belongs to, so this returns both rather
// than making the header repeat the lookup.
export function useCurrentMembership({
  currentUserId: currentUserIdProp,
  householdsDb,
}: UseShowNavInput): HouseholdMember | null | undefined {
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  )
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )

  useEffect(() => {
    if (currentUserIdProp !== undefined) {
      return
    }
    let cancelled = false
    let authReady = false

    void firebase.auth.authStateReady().then(() => {
      if (cancelled) {
        return
      }
      authReady = true
      setSessionUserId(firebase.auth.currentUser?.uid ?? null)
    })

    const unsubscribe = firebase.auth.onAuthStateChanged((user) => {
      if (!cancelled && authReady) {
        setSessionUserId(user?.uid ?? null)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUserIdProp, firebase.auth])

  // Through the query cache rather than a one-shot effect, so that signing
  // up can tell it to look again.
  //
  // It used to read the membership once, when the user id first appeared,
  // and keep whatever came back. On a brand-new account that read lands
  // between the account existing and the household being written, so it
  // got null -- and the app sat with no navigation at all until the page
  // was reloaded. Nobody who was already signed up would ever see it;
  // every jsdom test hands the membership in ready-made. Found by the
  // end-to-end suite, on its first run.
  const membershipQuery = useQuery({
    queryKey: currentMembershipQueryKey(currentUserId ?? null),
    queryFn: () =>
      typeof currentUserId === 'string'
        ? getMembership({ db, userId: currentUserId })
        : Promise.resolve(null),
    enabled: typeof currentUserId === 'string',
  })

  return typeof currentUserId === 'string'
    ? // undefined while it is still being read, which is what keeps the
      // nav from flashing in and out on a reload.
      (membershipQuery.data ?? (membershipQuery.isPending ? undefined : null))
    : null
}

// Invalidated when a household is created, so the shell picks it up without
// a reload.
export function currentMembershipQueryKey(
  userId: string | null,
): readonly ['current-membership', string | null] {
  return ['current-membership', userId]
}

export function useShowNav(input: UseShowNavInput): boolean {
  const membership = useCurrentMembership(input)
  return membership !== undefined && membership !== null
}

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
  const [membership, setMembership] = useState<
    HouseholdMember | null | undefined
  >(undefined)

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

  useEffect(() => {
    if (typeof currentUserId !== 'string') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const member = await getMembership({ db, userId: currentUserId })
        if (!cancelled) {
          setMembership(member)
        }
      } catch {
        if (!cancelled) {
          setMembership(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, db])

  return typeof currentUserId === 'string' ? membership : null
}

export function useShowNav(input: UseShowNavInput): boolean {
  const membership = useCurrentMembership(input)
  return membership !== undefined && membership !== null
}

import { useEffect, useMemo, useState } from 'react'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb } from './firestoreHouseholdsDb'
import { getMembership } from './households'
import type { HouseholdMember, HouseholdsDb } from './types'

export type UseHouseholdMembershipResult = {
  readonly currentUserId: string | null | undefined
  readonly db: HouseholdsDb
  readonly membership: HouseholdMember | null | undefined
}

// Resolves the signed-in user (from a live Firebase session, or the given
// prop for tests/SSR-style overrides) and their household membership. Used
// by pages that need `householdId` but aren't the app shell itself -- kept
// separate from AppShell's own copy of this logic (which additionally
// decides nav visibility) to avoid coupling page data-loading to the shell.
export function useHouseholdMembership(input: {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}): UseHouseholdMembershipResult {
  const { currentUserId: currentUserIdProp, householdsDb } = input
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<
    string | null | undefined
  >(undefined)
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const [membership, setMembership] = useState<
    HouseholdMember | null | undefined
  >(undefined)
  // Tracks the userId the current `membership` value was resolved for, so a
  // change can be detected and the stale value cleared during render --
  // React's documented pattern for "adjusting state when a prop changes"
  // (calling setState in an effect body for this would cause an extra
  // render and trips the set-state-in-effect lint rule).
  const [resolvedForUserId, setResolvedForUserId] = useState<
    string | null | undefined
  >(undefined)
  if (currentUserId !== resolvedForUserId) {
    setResolvedForUserId(currentUserId)
    setMembership(undefined)
  }

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

  return { currentUserId, db, membership }
}

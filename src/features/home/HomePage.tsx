import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { ExpenseList, RemainingBudgetDisplay } from '@/features/expenses'
import { InviteLinkPanel } from '@/features/invite'
import { OnboardingForm } from '@/features/onboarding'
import type { SignupAuth } from '@/features/onboarding'
import { useFirebase } from '@/lib/firebaseContext'
import {
  createFirestoreHouseholdsDb,
  getHousehold,
  getMembership,
} from '@/lib/households'
import type { Household, HouseholdMember, HouseholdsDb } from '@/lib/households'

export type HomePageProps = {
  readonly currentUserId?: string | null
  readonly signupAuth?: SignupAuth
  readonly householdsDb?: HouseholdsDb
}

export function HomePage({
  currentUserId: currentUserIdProp,
  signupAuth,
  householdsDb,
}: HomePageProps): ReactElement {
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
  const [household, setHousehold] = useState<Household | null>(null)
  const [homeEpoch, setHomeEpoch] = useState(0)

  useEffect(() => {
    if (currentUserIdProp !== undefined) {
      return
    }
    return firebase.auth.onAuthStateChanged((user) => {
      setSessionUserId(user?.uid ?? null)
    })
  }, [currentUserIdProp, firebase.auth])

  useEffect(() => {
    if (typeof currentUserId !== 'string') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const member = await getMembership({ db, userId: currentUserId })
        if (cancelled) {
          return
        }
        if (member === null) {
          setMembership(null)
          setHousehold(null)
          return
        }
        const loaded = await getHousehold({
          db,
          householdId: member.householdId,
        })
        if (cancelled) {
          return
        }
        setMembership(member)
        setHousehold(loaded)
      } catch {
        if (!cancelled) {
          setMembership(null)
          setHousehold(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, db, homeEpoch])

  if (currentUserId === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Loading…
      </p>
    )
  }

  if (currentUserId === null || membership === null) {
    return (
      <OnboardingForm
        householdsDb={householdsDb}
        signupAuth={signupAuth}
        onFinished={() => {
          setHomeEpoch((epoch) => epoch + 1)
        }}
      />
    )
  }

  if (membership === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Loading…
      </p>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <p className="text-sm font-medium">{household?.name ?? 'Household'}</p>
      <RemainingBudgetDisplay db={db} householdId={membership.householdId} />
      <InviteLinkPanel db={db} householdId={membership.householdId} />
      <ExpenseList db={db} householdId={membership.householdId} />
    </div>
  )
}

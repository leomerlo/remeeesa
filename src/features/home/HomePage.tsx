import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import {
  AddExpenseForm,
  ExpenseList,
  RemainingBudgetDisplay,
} from '@/features/expenses'
import type { EditExpenseTarget } from '@/features/expenses/AddExpenseForm'
import { InviteLinkPanel } from '@/features/invite'
import { LogoutButton } from '@/features/auth'
import { OnboardingForm } from '@/features/onboarding'
import type { SignupAuth } from '@/features/onboarding'
import { markReturningUser } from '@/features/onboarding/returningUserStorage'
import { useFirebase } from '@/lib/firebaseContext'
import {
  createFirestoreHouseholdsDb,
  getHousehold,
  getMembership,
} from '@/lib/households'
import type { Household, HouseholdMember, HouseholdsDb } from '@/lib/households'

export type HomePageProps = {
  readonly currentUserId?: string | null
  readonly authorDisplayName?: string
  readonly signupAuth?: SignupAuth
  readonly householdsDb?: HouseholdsDb
}

function authorDisplayNameFromAuth(
  user:
    | {
        readonly displayName?: string | null
        readonly email?: string | null
      }
    | null
    | undefined,
): string {
  const displayName = user?.displayName?.trim()
  if (displayName !== undefined && displayName !== '') {
    return displayName
  }
  const email = user?.email?.trim()
  if (email !== undefined && email !== '') {
    const localPart = email.split('@')[0]?.trim()
    if (localPart !== undefined && localPart !== '') {
      return localPart
    }
  }
  return 'Member'
}

export function HomePage({
  currentUserId: currentUserIdProp,
  authorDisplayName: authorDisplayNameProp,
  signupAuth,
  householdsDb,
}: HomePageProps): ReactElement {
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  )
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const usesLiveSession = currentUserIdProp === undefined
  const isSignedIn = typeof currentUserId === 'string'
  const showLogout = usesLiveSession && isSignedIn
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const [membership, setMembership] = useState<
    HouseholdMember | null | undefined
  >(undefined)
  const [household, setHousehold] = useState<Household | null>(null)
  const [homeEpoch, setHomeEpoch] = useState(0)
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(null)

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
    if (usesLiveSession && isSignedIn) {
      markReturningUser()
    }
  }, [usesLiveSession, isSignedIn])

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
      <div className="flex w-full flex-col items-center gap-8">
        {showLogout ? <LogoutButton /> : null}
        <OnboardingForm
          householdsDb={householdsDb}
          signupAuth={signupAuth}
          onFinished={() => {
            setHomeEpoch((epoch) => epoch + 1)
          }}
        />
      </div>
    )
  }

  if (membership === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Loading…
      </p>
    )
  }

  const authorDisplayName =
    authorDisplayNameProp ??
    authorDisplayNameFromAuth(firebase.auth?.currentUser)

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <p className="text-sm font-medium">{household?.name ?? 'Household'}</p>
      <RemainingBudgetDisplay db={db} householdId={membership.householdId} />
      <AddExpenseForm
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        editExpense={editExpense}
        onEditFinished={() => {
          setEditExpense(null)
        }}
      />
      <InviteLinkPanel db={db} householdId={membership.householdId} />
      <ExpenseList
        db={db}
        householdId={membership.householdId}
        onEditExpense={(expense, categoryName) => {
          setEditExpense({
            expenseId: expense.id,
            name: expense.name,
            price: expense.price,
            categoryName,
            comments: expense.comments,
            expenseDate: expense.expenseDate,
          })
        }}
      />
      {showLogout ? <LogoutButton /> : null}
    </div>
  )
}

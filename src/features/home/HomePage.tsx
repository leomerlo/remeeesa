import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AddExpenseSheet,
  RecentExpensesList,
  RemainingBudgetDisplay,
} from '@/features/expenses'
import type { EditExpenseTarget } from '@/features/expenses/AddExpenseForm'
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
import { CategoryMiniSummary } from './CategoryMiniSummary'
import { PersonMiniSummary } from './PersonMiniSummary'

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
  return 'Miembro'
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
  const [isAddExpenseSheetOpen, setIsAddExpenseSheetOpen] = useState(false)

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
        Cargando…
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
        Cargando…
      </p>
    )
  }

  const authorDisplayName =
    authorDisplayNameProp ??
    authorDisplayNameFromAuth(firebase.auth?.currentUser)

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex w-full items-center justify-between">
        <h1 className="text-title font-semibold">
          {household?.name ?? 'Hogar'}
        </h1>
        <Button variant="ghost" size="icon" asChild aria-label="Ajustes">
          <Link to="/household">
            <Settings aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <RemainingBudgetDisplay db={db} householdId={membership.householdId} />
      <div className="flex w-full gap-3">
        <AddExpenseSheet
          open={isAddExpenseSheetOpen}
          onOpenChange={setIsAddExpenseSheetOpen}
          db={db}
          householdId={membership.householdId}
          memberId={currentUserId}
          authorDisplayName={authorDisplayName}
          editExpense={editExpense}
          onEditFinished={() => {
            setEditExpense(null)
          }}
        />
        {editExpense === null ? (
          // Cuentas (bill-tracking, ADR-0004) isn't built yet -- issue #72
          // -- so this stays visible but inert rather than pretending the
          // feature exists. Remove `disabled` once #72 ships.
          <Button
            type="button"
            variant="outline"
            disabled
            className="flex-1 gap-1.5"
            title="Próximamente"
          >
            <Wallet aria-hidden="true" />
            Nueva cuenta
          </Button>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-3">
        <h2 className="text-title font-semibold self-start">
          Últimos movimientos
        </h2>
        <RecentExpensesList
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
      </div>
      <CategoryMiniSummary db={db} householdId={membership.householdId} />
      <PersonMiniSummary db={db} householdId={membership.householdId} />
    </div>
  )
}

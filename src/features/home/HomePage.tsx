import { useEffect, useMemo, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import {
  AddExpenseSheet,
  MonthNavigator,
  RecentExpensesList,
} from '@/features/expenses'
import type { EditExpenseTarget } from '@/features/expenses/AddExpenseForm'
import { AddPendienteSheet, PorPagarSection } from '@/features/pendientes'
import type { EditPendienteTarget } from '@/features/pendientes/AddPendienteForm'
import { LogoutButton } from '@/features/auth'
import { currentMonthRange } from '@/lib/expenses'
import { OnboardingForm } from '@/features/onboarding'
import type { SignupAuth } from '@/features/onboarding'
import { markReturningUser } from '@/features/onboarding/returningUserStorage'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import {
  createFirestoreHouseholdsDb,
  getHousehold,
  getMembership,
} from '@/lib/households'
import type { Household, HouseholdMember, HouseholdsDb } from '@/lib/households'
import { CategoryMiniSummary } from './CategoryMiniSummary'
import { GastoVsPendienteHint } from './GastoVsPendienteHint'
import { PersonMiniSummary } from './PersonMiniSummary'

export type HomePageProps = {
  readonly currentUserId?: string | null
  readonly authorDisplayName?: string
  readonly signupAuth?: SignupAuth
  readonly householdsDb?: HouseholdsDb
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
  const [isAddPendienteSheetOpen, setIsAddPendienteSheetOpen] = useState(false)
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(null)
  // Owned here (not inside MonthNavigator) so every month-scoped section on
  // the page -- not just its own two budget cards -- moves together when
  // the user pages to a different month.
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)

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
    return <LoadingIndicator />
  }

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col items-center gap-6">
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
    return <LoadingIndicator />
  }

  const authorDisplayName =
    authorDisplayNameProp ??
    authorDisplayNameFromAuth(firebase.auth?.currentUser)

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {/* No settings shortcut here: Ajustes is already one tap away in the
          bottom nav, so a second icon-link to the same destination is
          redundant. */}
      <PageHeader title={household?.name ?? 'Hogar'} />
      <MonthNavigator
        db={db}
        householdId={membership.householdId}
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
      />
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
          <AddPendienteSheet
            open={isAddPendienteSheetOpen}
            onOpenChange={setIsAddPendienteSheetOpen}
            db={db}
            householdId={membership.householdId}
            memberId={currentUserId}
            authorDisplayName={authorDisplayName}
            editPendiente={editPendiente}
            onEditFinished={() => {
              setEditPendiente(null)
            }}
            triggerClassName="flex-1"
          />
        ) : null}
      </div>
      <GastoVsPendienteHint />
      <PorPagarSection
        db={db}
        householdId={membership.householdId}
        onMarkPaid={(pendiente, categoryName) => {
          // Opens the same edit sheet as tapping a row on /pendientes, with
          // "Ya lo pagué" pre-checked -- one form for both editing and
          // paying (this used to open a separate amount-only sheet).
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
            defaultMarkPaid: true,
          })
        }}
      />
      <div className="flex w-full flex-col gap-3">
        <h2 className="text-title font-semibold self-start">
          Últimos movimientos del mes
        </h2>
        <RecentExpensesList
          db={db}
          householdId={membership.householdId}
          monthStart={monthStart}
          monthEnd={monthEnd}
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
      <CategoryMiniSummary
        db={db}
        householdId={membership.householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
      <PersonMiniSummary
        db={db}
        householdId={membership.householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
    </div>
  )
}

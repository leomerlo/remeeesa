import { useEffect, useMemo, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import {
  AddExpenseSheet,
  AddGastoSheet,
  MonthNavigator,
  RecentExpensesList,
} from '@/features/expenses'
import type { EditExpenseTarget } from '@/features/expenses/AddExpenseForm'
import {
  AddPendienteSheet,
  PendienteDueSoonBanner,
  PorPagarSection,
} from '@/features/pendientes'
import type { EditPendienteTarget } from '@/features/pendientes/AddPendienteForm'
import { LogoutButton } from '@/features/auth'
import { currentMonthRange } from '@/lib/expenses'
import { OnboardingForm } from '@/features/onboarding'
import type { SignupAuth } from '@/features/onboarding'
import { markReturningUser } from '@/features/onboarding/returningUserStorage'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getMembership } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
import { CategoryMiniSummary } from './CategoryMiniSummary'

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
  const [homeEpoch, setHomeEpoch] = useState(0)
  const [editExpense, setEditExpense] = useState<EditExpenseTarget | null>(null)
  const [isAddGastoSheetOpen, setIsAddGastoSheetOpen] = useState(false)
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
    // Only the membership: the household document itself is no longer read
    // here, now that its name is the app header's job rather than this
    // page's title.
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
  }, [currentUserId, db, homeEpoch])

  if (currentUserId === undefined) {
    return <LoadingIndicator />
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
    return <LoadingIndicator />
  }

  // The household member's own editable name (set in Ajustes via
  // updateMemberDisplayName), not the raw Firebase Auth profile -- using the
  // Auth profile directly ignored whatever name a member had chosen for
  // themselves, silently reverting every new Expense/Pendiente they created
  // back to their Google account's name. Per direct feedback.
  const authorDisplayName = authorDisplayNameProp ?? membership.displayName

  return (
    <div className="flex w-full flex-col items-center gap-8">
      {/* No page title here: the household's name is in the app header now,
          on every screen, rather than being Home's heading. */}
      <PendienteDueSoonBanner db={db} householdId={membership.householdId} />
      {/* The month, its two cards and the one action they lead to are one
          block -- at the page's own 32px rhythm the button floated between
          sections and read as belonging to neither. */}
      <div className="flex w-full flex-col gap-3">
        <MonthNavigator
          db={db}
          householdId={membership.householdId}
          viewedMonth={viewedMonth}
          onViewedMonthChange={setViewedMonth}
        />
        <AddGastoSheet
          open={isAddGastoSheetOpen}
          onOpenChange={setIsAddGastoSheetOpen}
          db={db}
          householdId={membership.householdId}
          memberId={currentUserId}
          authorDisplayName={authorDisplayName}
        />
      </div>
      {/* Both mounted purely to edit/mark-paid a row they were handed
          (editExpense/editPendiente) -- adding goes through AddGastoSheet
          above instead, so neither shows its own trigger here. */}
      <AddExpenseSheet
        open={false}
        showTrigger={false}
        onOpenChange={() => {}}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        editExpense={editExpense}
        onEditFinished={() => {
          setEditExpense(null)
        }}
      />
      <AddPendienteSheet
        open={false}
        showTrigger={false}
        onOpenChange={() => {}}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        editPendiente={editPendiente}
        onEditFinished={() => {
          setEditPendiente(null)
        }}
      />
      {/* One column on a phone, two from lg: the month's outstanding
          services and the recent movements are the things being read, the
          category split is a reference panel beside them. */}
      <div className="flex w-full flex-col gap-8 lg:grid lg:grid-cols-3 lg:items-start">
        <div className="flex w-full flex-col gap-8 lg:col-span-2">
          <PorPagarSection
            db={db}
            householdId={membership.householdId}
            monthStart={monthStart}
            monthEnd={monthEnd}
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
              Últimos gastos del mes
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
                  memberId: expense.memberId,
                  pendienteId: expense.pendienteId,
                  isService: expense.isService,
                })
              }}
            />
          </div>
        </div>
        <CategoryMiniSummary
          db={db}
          householdId={membership.householdId}
          monthStart={monthStart}
          monthEnd={monthEnd}
        />
      </div>
    </div>
  )
}

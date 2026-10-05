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
import type { EditPurchaseTarget } from '@/features/expenses/AddGastoForm'
import {
  AddPendienteSheet,
  CardsNextMonth,
  PendienteDueSoonBanner,
  PorPagarSection,
} from '@/features/pendientes'
import type { EditPendienteTarget } from '@/features/pendientes/AddPendienteForm'
import { LogoutButton } from '@/features/auth'
import { InviteHouseholdBanner } from './InviteHouseholdBanner'
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
  const [editPurchase, setEditPurchase] = useState<EditPurchaseTarget | null>(
    null,
  )
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(null)
  // Owned here (not inside MonthNavigator) so every month-scoped section on
  // the page -- not just its own two budget cards -- moves together when
  // the user pages to a different month.
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)
  // Home reaches one month ahead, to plan it before it starts -- see
  // docs/next-month-view-design.md.
  const isFutureMonth = monthStart > currentMonthRange().monthStart

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
      {/* Above everything, and only while the household is one person with
          nothing logged. What used to sit here was an "Empezá por acá"
          checklist telling them to set a budget, add a servicio and log a
          gasto -- three things the screen underneath already asks for, in
          its own empty cards, where the action actually is. Per direct
          feedback: drop the checklist, and use the space for the one thing
          Home could not say on its own. */}
      <InviteHouseholdBanner db={db} householdId={membership.householdId} />
      {/* One column on a phone; from `lg` a 9/3 dashboard. Everything you
          act on is the wide column; the right one is the two things you
          only read -- what is about to come due, and where the month went.

          The three live in one grid rather than in two nested columns so
          the right column can start level with the month pager while the
          due-soon banner still comes *first* on a phone, where it is the
          most urgent thing on the screen and there is no second column to
          put it in. That is what the explicit row/column placement below
          is for; order-* handles the phone, col-start/row-start the rest.

          The rows are auto/1fr, not auto/auto: the wide column spans both,
          and with two auto rows the browser splits its height between them,
          which pushed the second thing in the right column halfway down the
          page. 1fr absorbs the slack instead, so the right column stacks
          tight to the top -- and collapses cleanly to nothing on a month
          with no bill coming due.

          And when it collapses to nothing -- a new household, where there
          is no bill due and nothing spent to break down -- the wide column
          takes all twelve instead of leaving a quarter of the screen
          empty. That is what home-grid/home-main plus the two data-aside
          marks below are for: the column asks whether either of them actually rendered
          anything, which is the same question `null` already answers, so
          the two can never disagree. Written as `:not(:has(...))` on top of
          the 9-column default on purpose -- a browser without `:has()`
          drops the whole rule and keeps the layout it has always had,
          rather than running the main column under the aside. Per direct
          feedback. */}
      <div className="home-grid flex w-full flex-col gap-8 lg:grid lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-8">
        <div
          data-aside=""
          className="order-1 w-full lg:order-none lg:col-span-3 lg:col-start-10 lg:row-start-1"
        >
          <PendienteDueSoonBanner
            db={db}
            householdId={membership.householdId}
            memberId={currentUserId}
            authorDisplayName={authorDisplayName}
            onMarkPaid={(pendiente, categoryName) => {
              // The same sheet Cuentas por pagar opens, with "Ya lo pagué"
              // already ticked: tapping what is about to come due is how
              // you settle it.
              setEditPendiente({
                pendienteId: pendiente.id,
                name: pendiente.name,
                categoryName,
                dueDate: pendiente.dueDate,
                expectedAmount: pendiente.expectedAmount,
                recurring: pendiente.recurring,
                autoDebit: pendiente.autoDebit,
                defaultMarkPaid: true,
              })
            }}
          />
        </div>
        <div className="home-main order-2 flex w-full flex-col gap-8 lg:order-none lg:col-span-9 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {/* The month, its two cards and the one action they lead to are one
          block -- at the page's own 32px rhythm the button floated between
          sections and read as belonging to neither. */}
          <div className="flex w-full flex-col gap-3">
            <MonthNavigator
              db={db}
              householdId={membership.householdId}
              viewedMonth={viewedMonth}
              onViewedMonthChange={setViewedMonth}
              maxMonthsAhead={1}
            />
            <AddGastoSheet
              {...(isFutureMonth ? { defaultDueDate: monthStart } : {})}
              // No trigger of its own: the header carries this from `lg` up
              // and the bar's round button carries it on a phone, so a
              // third copy under the budget card was the same action said
              // three times. It stays mounted so the onboarding checklist
              // and a row being edited can still open it. Per direct
              // feedback.
              showTrigger={false}
              open={isAddGastoSheetOpen}
              onOpenChange={setIsAddGastoSheetOpen}
              editPurchase={editPurchase}
              onEditFinished={() => {
                setEditPurchase(null)
              }}
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
          <div className="flex w-full flex-col gap-8">
            <div className="flex w-full flex-col gap-8">
              {/* Always next calendar month, not the viewed one: it is the card
              bill coming up, said before it arrives. */}
              <CardsNextMonth db={db} householdId={membership.householdId} />
              <PorPagarSection
                db={db}
                householdId={membership.householdId}
                memberId={currentUserId}
                authorDisplayName={authorDisplayName}
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
                    autoDebit: pendiente.autoDebit,
                    defaultMarkPaid: true,
                  })
                }}
              />
              {/* Hidden in a future month: a paid gasto cannot be dated in the
              future, so the list could only ever be empty there. */}
              {isFutureMonth ? null : (
                <div className="flex w-full flex-col gap-3">
                  <h2 className="text-title font-semibold self-start">
                    Últimos gastos del mes
                  </h2>
                  <RecentExpensesList
                    db={db}
                    householdId={membership.householdId}
                    monthStart={monthStart}
                    monthEnd={monthEnd}
                    onAddGasto={() => {
                      setIsAddGastoSheetOpen(true)
                    }}
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
                        currency: expense.currency,
                        paymentMethodId: expense.paymentMethodId,
                      })
                    }}
                    onEditPurchase={(purchase, categoryName) => {
                      setEditPurchase({ purchase, categoryName })
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          data-aside=""
          className="order-3 w-full lg:order-none lg:col-span-3 lg:col-start-10 lg:row-start-2"
        >
          <CategoryMiniSummary
            db={db}
            householdId={membership.householdId}
            monthStart={monthStart}
            monthEnd={monthEnd}
          />
        </div>
      </div>
    </div>
  )
}

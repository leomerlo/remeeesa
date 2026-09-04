import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computePendingCommitted,
  computeSpentThisMonth,
  currentMonthRange,
  formatCurrency,
  isDateInCurrentMonth,
  listExpensesInMonth,
} from '@/lib/expenses'
import { listPendientes } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { expensesInMonthQueryKey } from './queryKeys'

export type SpentThisMonthDisplayProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. MonthNavigator passes the month it's
  // paging through instead -- this card has no month-picking UI of its own,
  // it just renders whatever range it's given.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

// The peer to RemainingBudgetDisplay's card: that one counts down from the
// budget, this one counts up from zero. Together they answer the two
// questions a household actually has -- "how much is left" and "how much
// have we gone through" -- which a single number can't do at once.
//
// Reads the same expensesInMonthQueryKey cache entry RemainingBudgetDisplay
// already populates -- Tanstack Query's cache dedupes the underlying fetch
// as long as the key and query function shape match, so this costs no extra
// Firestore read. The headline figure is "every Expense this month" (paying
// a Pendiente generates the Expense that counts here, same as a Gasto
// logged directly) PLUS every currently-pending Pendiente's expected amount
// -- per direct feedback, a bill that's due but unpaid still has to count
// against the budget, not just once it's actually paid. Pending only counts
// while viewing the real current month: a past month is closed history, and
// today's still-owed bills have no bearing on what was left back then.
export function SpentThisMonthDisplay({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: SpentThisMonthDisplayProps): ReactElement {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const includesPending = isDateInCurrentMonth(monthStart)
  // The query key changes with the viewed month, matching
  // RemainingBudgetDisplay's own key -- both read the exact same cache
  // entry for a given month, so paging between them costs one fetch, not
  // two, and a past month stays cached under its own entry instead of
  // being evicted every time the current month's is refetched.
  const expensesQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      }),
  })
  // Not month-scoped -- every currently-pending Pendiente regardless of due
  // date, matching what Cuentas por pagar itself shows. Shares its key/shape
  // with RemainingBudgetDisplay's identical query, same dedupe reasoning as
  // expensesQuery above. Skipped entirely for a past month: nothing to add.
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
    enabled: includesPending,
  })
  const expenses = expensesQuery.data
  const pending = includesPending ? pendingQuery.data : []

  if (expenses === undefined || pending === undefined) {
    // Shaped like the resolved card (heading / amount, each its own bar) so
    // nothing jumps in size once the real figure lands.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card shadow-resting flex w-full flex-col gap-2 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-11 w-48" />
      </div>
    )
  }

  const spent = computeSpentThisMonth(expenses)
  const pendingCommitted = computePendingCommitted(pending)
  const formattedSpent = formatCurrency(spent + pendingCommitted)

  return (
    <div className="bg-card shadow-resting flex w-full flex-col gap-2 rounded-3xl p-6">
      {/* No month label here -- MonthNavigator (Home's shared control above
          both cards) is the one place that says which month is being
          viewed now; repeating it on every card it renders was three
          copies of the same sentence. */}
      <span className="text-foreground text-body font-medium">
        Gastado este mes
      </span>
      <p
        role="status"
        aria-label={`Gastado este mes ${formattedSpent}`}
        className="text-foreground font-display text-display tracking-tight"
      >
        {formattedSpent}
      </p>
      {/* Only shown once there's something to differentiate -- per direct
          feedback, this figure now bundles what's already paid with what's
          still owed, so the breakdown is what tells them apart. */}
      {pendingCommitted > 0 ? (
        <span className="text-muted-foreground text-xs">
          {formatCurrency(spent)} pagado + {formatCurrency(pendingCommitted)}{' '}
          pendiente
        </span>
      ) : null}
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computePendingCommitted,
  computeSpentThisMonth,
  currentMonthRange,
  formatCurrency,
  listExpensesInMonth,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
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
// logged directly) PLUS every currently-pending Pendiente actually due
// within this same month -- per direct feedback, a bill due but unpaid
// still has to count against the budget, but only the month it's actually
// due in; a bill due next month shouldn't already eat into this one.
export function SpentThisMonthDisplay({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: SpentThisMonthDisplayProps): ReactElement {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
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
  // Not itself month-scoped in the query (every currently-pending Pendiente
  // regardless of due date, matching what Cuentas por pagar itself shows) --
  // narrowed to the viewed month below, via pendientesDueInMonth. Shares its
  // key/shape with RemainingBudgetDisplay's identical query, same dedupe
  // reasoning as expensesQuery above.
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })
  const expenses = expensesQuery.data
  const pending = pendingQuery.data

  if (expenses === undefined || pending === undefined) {
    // Shaped like the resolved card (heading / amount, each its own bar) so
    // nothing jumps in size once the real figure lands.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card flex w-full flex-col gap-2 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-11 w-48" />
      </div>
    )
  }

  const spent = computeSpentThisMonth(expenses)
  const pendingCommitted = computePendingCommitted(
    pendientesDueInMonth(pending, monthStart, monthEnd),
  )
  const formattedSpent = formatCurrency(spent + pendingCommitted)

  return (
    <div className="bg-card flex w-full flex-col gap-2 rounded-3xl p-6">
      {/* No month label here -- MonthNavigator (Home's shared control above
          both cards) is the one place that says which month is being
          viewed now; repeating it on every card it renders was three
          copies of the same sentence. */}
      <span className="text-foreground text-body font-medium">
        Gastos de este mes
      </span>
      <p
        role="status"
        aria-label={`Gastos de este mes ${formattedSpent}`}
        className="text-foreground font-display text-display tracking-tight"
      >
        {formattedSpent}
      </p>
      {/* Only shown once there's something to differentiate -- per direct
          feedback, this figure now bundles what's already paid with what's
          still owed, so the breakdown is what tells them apart.

          pr-28 keeps it clear of the piggy illustration, which is anchored
          to the card *below* this one and overhangs its bottom-right corner
          -- as one flat run of text the line ran straight under the
          illustration's head and the last word was unreadable. The two
          halves are each whitespace-nowrap, so when the line runs out of
          room it breaks between them, never mid-figure.

          Within each half the amount carries the weight and the label
          recedes: the two numbers are what's being compared, and at one
          uniform grey there was nothing to compare -- just a sentence. */}
      {pendingCommitted > 0 ? (
        <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-1 pr-28 text-sm lg:pr-0">
          <span className="whitespace-nowrap">
            <span
              aria-hidden="true"
              className="bg-success mr-1.5 inline-block size-2 rounded-full align-middle"
            />
            <span className="text-foreground font-semibold">
              {formatCurrency(spent)}
            </span>{' '}
            pagado
          </span>
          <span className="whitespace-nowrap">
            <span
              aria-hidden="true"
              className="bg-warning mr-1.5 inline-block size-2 rounded-full align-middle"
            />
            <span className="text-foreground font-semibold">
              {formatCurrency(pendingCommitted)}
            </span>{' '}
            pendiente
          </span>
        </p>
      ) : null}
    </div>
  )
}

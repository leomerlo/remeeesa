import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatAmount,
  computeMonthTotalIn,
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
        className="bg-card card-surface flex w-full flex-col gap-2 rounded-3xl p-6 lg:flex-[2]"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-11 w-48" />
      </div>
    )
  }

  const spent = computeSpentThisMonth(expenses)
  const dueThisMonth = pendientesDueInMonth(pending, monthStart, monthEnd)
  const pendingCommitted = computePendingCommitted(dueThisMonth)
  const formattedSpent = formatCurrency(spent + pendingCommitted)
  // What the same month came to in dollars. Never added into the figure
  // above -- the budget is a number of pesos -- but said out loud beside
  // it, because leaving it out of every total is not the same as hiding
  // it. Per direct feedback.
  const usedUsd = computeMonthTotalIn({
    expenses,
    pendientes: dueThisMonth,
    currency: 'USD',
  })

  // A month with nothing in it yet gets its own card rather than the real
  // one with a zero in it: the figure is the whole point of this card, and
  // "$0" flush left under a label is the one state where it says nothing.
  // Centred, with the mascot and a line that explains the zero instead of
  // leaving it to be read as an error. The card with real figures is
  // untouched -- per direct feedback, only the zero changes.
  if (spent + pendingCommitted === 0 && usedUsd === 0) {
    return (
      <div className="bg-card card-surface flex w-full flex-col items-center justify-center gap-4 rounded-3xl p-6 text-center lg:flex-[2]">
        <span
          aria-hidden="true"
          className="bg-muted flex size-24 shrink-0 items-center justify-center rounded-full"
        >
          <Illustration src={ILLUSTRATIONS.celebrating} className="size-16" />
        </span>
        <div className="flex flex-col items-center gap-1">
          <span className="text-foreground text-body font-medium">En uso</span>
          <p
            role="status"
            aria-label={`En uso ${formattedSpent}`}
            className="text-foreground font-heading text-display tabular-money font-extrabold tracking-tight"
          >
            {formattedSpent}
          </p>
          <p className="text-muted-foreground max-w-xs text-sm">
            Este mes todavía está limpio. Lo que carguen va saliendo de acá.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card card-surface flex w-full flex-col gap-2 rounded-3xl p-6 lg:flex-[2]">
      {/* No month label here -- MonthNavigator (Home's shared control above
          both cards) is the one place that says which month is being
          viewed now; repeating it on every card it renders was three
          copies of the same sentence. */}
      {/* "En uso", not "Gastado": the figure bundles what has actually
          left the household with what is still owed this month, and calling
          that "gastado" claimed more than it knew. Per direct feedback. */}
      <span className="text-foreground text-body font-medium">En uso</span>
      <p
        role="status"
        aria-label={`En uso ${formattedSpent}`}
        className="text-foreground font-heading text-display tabular-money font-extrabold tracking-tight"
      >
        {formattedSpent}
      </p>
      {/* Its own line, in its own currency, directly under the peso figure
          it is not part of. */}
      {usedUsd === 0 ? null : (
        <p className="text-muted-foreground money -mt-1 text-base">
          y {formatAmount(usedUsd, 'USD')}
        </p>
      )}
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
      {/* Two rows, dot then label then figure, the same shape the category
          list on Home has -- read as one line the two figures ran together
          and neither stood out. Per direct feedback. */}
      {pendingCommitted > 0 ? (
        <dl className="divide-border-subtle -mb-1 flex flex-col divide-y text-sm">
          <div className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-dot-paid size-2.5 shrink-0 rounded-full"
              />
              Pagaste
            </dt>
            <dd className="text-foreground shrink-0 font-semibold">
              {formatCurrency(spent)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-1.5">
            <dt className="text-muted-foreground flex items-center gap-2">
              <span
                aria-hidden="true"
                className="bg-dot-pending size-2.5 shrink-0 rounded-full"
              />
              Pendiente de pago
            </dt>
            <dd className="text-foreground shrink-0 font-semibold">
              {formatCurrency(pendingCommitted)}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  )
}

import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  computePendingCommitted,
  formatCompactCurrency,
  formatCurrency,
  lastNMonthRanges,
  listExpensesInMonth,
  MONTHLY_TOTALS_MONTH_COUNT,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { MonthlyTrendShape } from './MonthlyTrendShape'

export type MonthlyTotalsChartProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

const SHORT_MONTH_FORMAT = new Intl.DateTimeFormat('es-AR', { month: 'short' })

// "sept." -> "sept" -- es-AR's abbreviated month names carry a trailing
// period that reads as a typo at the size a bar's own label renders at.
function shortMonthLabel(date: Date): string {
  return SHORT_MONTH_FORMAT.format(date).replace(/\.$/, '')
}

// The trend companion to "Por categoría" above it: MONTHLY_TOTALS_MONTH_COUNT
// months of total spend as a curve, so a one-off big month reads as a spike
// against its neighbours instead of just a number on its own.
//
// Each bar counts the same money "Gastos del mes" and "Por categoría" do
// -- that month's Expenses plus the still-unpaid bills due in it. Per
// direct feedback: counting only what had been paid here left this chart's
// current-month bar disagreeing with the card right above it, two numbers
// for the same month on adjacent screens.
//
// Fetches each month with the exact queryKey shape RecentExpensesList
// already uses (expensesInMonthQueryKey + the month's own timestamp), so the
// current month's bar shares its cache entry with Home instead of issuing a
// duplicate fetch when this page is opened after Home.
export function MonthlyTotalsChart({
  db,
  householdId,
}: MonthlyTotalsChartProps): ReactElement | null {
  const now = useMemo(() => new Date(), [])
  const ranges = useMemo(
    () => lastNMonthRanges(MONTHLY_TOTALS_MONTH_COUNT, now),
    [now],
  )
  // Which bar's tooltip is showing, if any -- a bar chart with no axis
  // labels for amounts has no other way to see a month's exact total
  // without tapping it. Tapping the same bar again hides it; tapping a
  // different one swaps straight to that one's tooltip.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const monthQueries = useQueries({
    queries: ranges.map((range) => ({
      queryKey: [
        ...expensesInMonthQueryKey({ householdId }),
        range.monthStart.getTime(),
      ],
      queryFn: () =>
        listExpensesInMonth({
          db,
          householdId,
          monthStart: range.monthStart,
          monthEnd: range.monthEnd,
        }),
    })),
  })

  // One fetch of every pending Pendiente, split per month below rather than
  // queried per month -- same key/shape the budget cards use, so it shares
  // their cache entry.
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })

  const isPending =
    monthQueries.some((query) => query.isPending) || pendingQuery.isPending
  const isError =
    monthQueries.some((query) => query.isError) || pendingQuery.isError

  if (isPending) {
    return (
      <section
        aria-label="Cargando…"
        role="status"
        className="flex w-full flex-col gap-3"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-52 w-full rounded-2xl lg:h-64" />
      </section>
    )
  }

  // A failed chart must not take the rest of Categorías down with it -- the
  // breakdown above is still perfectly usable, so this degrades to nothing.
  if (isError) {
    return null
  }

  const pending = pendingQuery.data ?? []
  const totals = ranges.map((range, index) => ({
    monthStart: range.monthStart,
    total:
      (monthQueries[index]?.data ?? []).reduce(
        (sum, expense) => sum + expense.price,
        0,
      ) +
      computePendingCommitted(
        pendientesDueInMonth(pending, range.monthStart, range.monthEnd),
      ),
  }))

  // Nothing spent in any of these months at all (a brand-new household):
  // MONTH_COUNT empty bars would say nothing the empty state above it
  // hasn't already said.
  const grandTotal = totals.reduce((sum, entry) => sum + entry.total, 0)
  if (grandTotal === 0) {
    return null
  }

  return (
    <section
      aria-labelledby="por-mes-heading"
      className="flex w-full flex-col gap-3"
    >
      {/* Title outside the card, like every other section on this page --
          which also lines it up with "Por categoría" beside it, since the
          two are the headings of the page's two columns. Per direct
          feedback. */}
      <h2 id="por-mes-heading" className="text-title font-semibold">
        Gastos por mes
      </h2>
      <div className="bg-card card-surface w-full rounded-2xl p-5">
        {/* The exact total for a month is reachable two ways: tapping its
          point reveals it in a tooltip (sighted, on-demand), and each
          month's own accessible name carries it unconditionally (screen
          readers get it on focus, no tap needed). */}
        <MonthlyTrendShape
          points={totals.map((entry) => ({
            label: shortMonthLabel(entry.monthStart),
            total: entry.total,
          }))}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          formatAmount={formatCurrency}
          formatTick={formatCompactCurrency}
        />
      </div>
    </section>
  )
}

import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  computePendingCommitted,
  formatCurrency,
  lastNMonthRanges,
  listExpensesInMonth,
  MONTHLY_TOTALS_MONTH_COUNT,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { cn } from '@/lib/utils'

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
// months of total spend as bars, so a one-off big month reads as a spike
// against its neighbours instead of just a number on its own.
//
// Each bar counts the same money "Gastado este mes" and "Por categoría" do
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
        className="bg-card shadow-resting flex w-full flex-col gap-4 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-5 w-24" />
        <div className="flex h-32 w-full items-end gap-2">
          {ranges.map((range) => (
            <Skeleton
              key={range.monthStart.getTime()}
              className="h-full w-full rounded-t-lg"
            />
          ))}
        </div>
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

  const maxTotal = Math.max(...totals.map((entry) => entry.total))
  const currentMonthTime = ranges[ranges.length - 1]?.monthStart.getTime()

  return (
    <section
      aria-labelledby="por-mes-heading"
      className="bg-card shadow-resting flex w-full flex-col gap-4 rounded-3xl p-6"
    >
      <h2 id="por-mes-heading" className="text-title font-semibold">
        Por mes
      </h2>
      {/* Bars have no visible axis labels for amounts -- the exact total is
          reachable two ways: tapping a bar reveals it in a tooltip
          (sighted, on-demand), and each bar's own accessible name carries
          it unconditionally (screen readers get it on focus, no tap
          needed). */}
      <ul
        aria-label="Gasto total por mes"
        className="flex h-32 w-full items-end gap-2"
      >
        {totals.map((entry, index) => {
          const heightPercent =
            maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0
          const isCurrentMonth = entry.monthStart.getTime() === currentMonthTime
          const isSelected = selectedIndex === index

          return (
            <li
              key={entry.monthStart.getTime()}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              {/* This wrapper (not the <li>) is the tooltip's positioning
                  parent, sized to exactly the bar's own height -- bottom-full
                  then lands the tooltip right above the bar's actual top
                  edge, short or tall, rather than an offset guessed to clear
                  the month label below it. */}
              <div
                className="relative w-full"
                style={{ height: `${String(heightPercent)}%` }}
              >
                {isSelected ? (
                  <div
                    role="tooltip"
                    className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap"
                  >
                    {formatCurrency(entry.total)}
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-expanded={isSelected}
                  aria-label={`${shortMonthLabel(entry.monthStart)}: ${formatCurrency(entry.total)}`}
                  className={cn(
                    'h-full w-full rounded-t-lg transition-colors',
                    // The bars *are* the data, so each one has to clear 3:1
                    // against the card it sits on. At /25 a past month's bar
                    // measured 1.46:1 -- visible only as a hint of colour.
                    isCurrentMonth ? 'bg-primary' : 'bg-primary/70',
                    isSelected && !isCurrentMonth && 'bg-primary/85',
                  )}
                  onClick={() => {
                    setSelectedIndex(isSelected ? null : index)
                  }}
                />
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                {shortMonthLabel(entry.monthStart)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

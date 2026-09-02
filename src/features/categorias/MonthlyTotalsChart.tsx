import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  formatCurrency,
  lastNMonthRanges,
  listExpensesInMonth,
  MONTHLY_TOTALS_MONTH_COUNT,
} from '@/lib/expenses'
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

  const isPending = monthQueries.some((query) => query.isPending)
  const isError = monthQueries.some((query) => query.isError)

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

  const totals = ranges.map((range, index) => ({
    monthStart: range.monthStart,
    total: (monthQueries[index]?.data ?? []).reduce(
      (sum, expense) => sum + expense.price,
      0,
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
      {/* Bars are aria-hidden and each month's exact total lives in a
          sr-only span instead -- a screen reader announcing "23 percent
          height" for six bars in a row would be noise, not information. */}
      <ul
        aria-label="Gasto total por mes"
        className="flex h-32 w-full items-end gap-2"
      >
        {totals.map((entry) => {
          const heightPercent =
            maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0
          const isCurrentMonth = entry.monthStart.getTime() === currentMonthTime

          return (
            <li
              key={entry.monthStart.getTime()}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <div
                aria-hidden="true"
                className={cn(
                  'w-full rounded-t-lg',
                  isCurrentMonth ? 'bg-primary' : 'bg-primary/25',
                )}
                style={{ height: `${String(heightPercent)}%` }}
              />
              <span className="text-muted-foreground shrink-0 text-xs">
                {shortMonthLabel(entry.monthStart)}
              </span>
              <span className="sr-only">{formatCurrency(entry.total)}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

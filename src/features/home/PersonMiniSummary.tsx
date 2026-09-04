import { useQuery } from '@tanstack/react-query'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  currentMonthRange,
  formatCurrency,
  listExpensesInMonth,
  summarizeByPerson,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'

export type PersonMiniSummaryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. MonthNavigator's viewed month flows down
  // to this (and every other Home section that reads a month of Expenses)
  // so paging back a month moves the whole page together, not just the two
  // budget cards.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

// Home-only mini-summary. Runs its own independent useQuery on the same
// expensesInMonthQueryKey cache entry the rest of Home's month-scoped
// sections already populate -- Tanstack Query's cache dedupes the
// underlying fetch as long as the key and query function shape match, so
// this doesn't cause an extra Firestore read.
export function PersonMiniSummary({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: PersonMiniSummaryProps): ReactElement | null {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
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

  const expenses = expensesQuery.data

  if (expenses === undefined) {
    return <LoadingIndicator />
  }

  const summary = summarizeByPerson({ expenses })

  // Same reasoning as CategoryMiniSummary: nothing at all rather than a
  // second (here, third) heading repeating "Todavía no hay gastos este mes".
  if (summary.length === 0) {
    return null
  }

  // Title outside; rows share one card, separated by a thin divider --
  // a tidy list rather than a card per row (that treatment stays on
  // "Últimos gastos" above, whose rows carry more weight: an icon,
  // amount, and two lines of meta, vs. this section's plain name + total).
  return (
    <div className="flex w-full flex-col gap-3">
      {/* "Integrantes" alone read as a plain member roster (like Ajustes'
          own "Integrantes" list, no amounts) rather than what this actually
          is: what each person has spent -- per direct feedback, someone
          compared this total against Cuentas por pagar's still-unpaid
          total and got confused when they didn't match. "Gastos por
          persona" matches CategoryMiniSummary's "Gastos por categoría"
          sibling naming, and the aria-label this list already carried. */}
      <h2 className="text-title font-semibold self-start">
        Gastos por persona
      </h2>
      <ul
        aria-label="Gastos por persona"
        className="bg-card shadow-resting divide-border flex w-full flex-col divide-y rounded-2xl text-sm"
      >
        {summary.map((entry) => (
          <li
            key={entry.authorDisplayName}
            className="flex items-center justify-between gap-2 p-4"
          >
            <span className="truncate text-foreground">
              {entry.authorDisplayName}
            </span>
            <span className="shrink-0 font-medium text-foreground">
              {formatCurrency(entry.total)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

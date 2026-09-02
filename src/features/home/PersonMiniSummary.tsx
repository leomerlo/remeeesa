import { useQuery } from '@tanstack/react-query'
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
}

// Home-only mini-summary. Runs its own independent useQuery on the same
// expensesInMonthQueryKey cache entry RemainingBudgetDisplay already
// populates for the current month -- Tanstack Query's cache dedupes the
// underlying fetch as long as the key and query function shape match, so
// this doesn't cause an extra Firestore read.
export function PersonMiniSummary({
  db,
  householdId,
}: PersonMiniSummaryProps): ReactElement | null {
  const monthRange = useMemo(() => currentMonthRange(), [])
  const expensesQuery = useQuery({
    queryKey: expensesInMonthQueryKey({ householdId }),
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart: monthRange.monthStart,
        monthEnd: monthRange.monthEnd,
      }),
  })

  const expenses = expensesQuery.data

  if (expenses === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  const summary = summarizeByPerson({ expenses })

  // Same reasoning as CategoryMiniSummary: nothing at all rather than a
  // second (here, third) card repeating "Todavía no hay gastos este mes".
  if (summary.length === 0) {
    return null
  }

  return (
    <div className="bg-card shadow-resting flex w-full flex-col gap-3 rounded-2xl p-4">
      <h2 className="text-title font-semibold">Integrantes</h2>
      <ul aria-label="Gastos por persona" className="flex flex-col gap-2">
        {summary.map((entry) => (
          <li
            key={entry.authorDisplayName}
            className="flex items-center justify-between gap-2 text-sm"
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

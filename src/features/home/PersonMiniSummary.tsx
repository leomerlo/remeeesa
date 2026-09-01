import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  currentMonthRange,
  listExpensesInMonth,
  summarizeByPerson,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'

export type PersonMiniSummaryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

function formatAmount(amount: number): string {
  return amount.toFixed(2)
}

// Home-only mini-summary. Runs its own independent useQuery on the same
// expensesInMonthQueryKey cache entry RemainingBudgetDisplay already
// populates for the current month -- Tanstack Query's cache dedupes the
// underlying fetch as long as the key and query function shape match, so
// this doesn't cause an extra Firestore read.
export function PersonMiniSummary({
  db,
  householdId,
}: PersonMiniSummaryProps): ReactElement {
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

  return (
    <div className="bg-card shadow-resting flex w-full flex-col gap-3 rounded-2xl p-4">
      <h2 className="text-title font-semibold">Integrantes</h2>
      {summary.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          Todavía no hay gastos este mes
        </p>
      ) : (
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
                {formatAmount(entry.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

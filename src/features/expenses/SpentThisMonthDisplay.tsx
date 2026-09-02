import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  computeSpentThisMonth,
  currentMonthRange,
  formatCurrency,
  listExpensesInMonth,
} from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { expensesInMonthQueryKey } from './queryKeys'

export type SpentThisMonthDisplayProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// The peer to RemainingBudgetDisplay's card: that one counts down from the
// budget, this one counts up from zero. Together they answer the two
// questions a household actually has -- "how much is left" and "how much
// have we gone through" -- which a single number can't do at once.
//
// Reads the same expensesInMonthQueryKey cache entry RemainingBudgetDisplay
// already populates -- Tanstack Query's cache dedupes the underlying fetch
// as long as the key and query function shape match, so this costs no extra
// Firestore read. The sum genuinely is "every Expense this month" with no
// separate Gasto/Pendiente split: paying a Pendiente generates the Expense
// that counts here, at the moment the money actually leaves the household,
// same as a Gasto logged directly.
export function SpentThisMonthDisplay({
  db,
  householdId,
}: SpentThisMonthDisplayProps): ReactElement {
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
    // Shaped like the resolved card (month label / heading / amount, each
    // its own bar) so nothing jumps in size once the real figure lands.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card shadow-resting flex w-full flex-col gap-2 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-11 w-48" />
      </div>
    )
  }

  const spent = computeSpentThisMonth(expenses)
  const formattedSpent = formatCurrency(spent)

  return (
    <div className="bg-card shadow-resting flex w-full flex-col gap-2 rounded-3xl p-6">
      <span className="text-muted-foreground text-xs font-medium">
        {formatMonthLabel(monthRange.monthStart)}
      </span>
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
    </div>
  )
}

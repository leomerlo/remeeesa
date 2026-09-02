import { useQuery } from '@tanstack/react-query'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import {
  categoriesQueryKey,
  expensesInMonthQueryKey,
} from '@/features/expenses'
import {
  currentMonthRange,
  formatCurrency,
  listCategories,
  listExpensesInMonth,
  summarizeByCategory,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'

export type CategoryMiniSummaryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. MonthNavigator's viewed month flows down
  // to this (and every other Home section that reads a month of Expenses)
  // so paging back a month moves the whole page together, not just the two
  // budget cards.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

const TOP_CATEGORY_COUNT = 5

// Home-only mini-summary. Runs its own independent useQuery on the same
// expensesInMonthQueryKey/categoriesQueryKey cache entries the rest of
// Home's month-scoped sections already populate -- Tanstack Query's cache
// dedupes the underlying fetch as long as the key and query function shape
// match, so this doesn't cause an extra Firestore read.
export function CategoryMiniSummary({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: CategoryMiniSummaryProps): ReactElement | null {
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
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  const expenses = expensesQuery.data
  const categories = categoriesQuery.data

  if (expenses === undefined || categories === undefined) {
    return <LoadingIndicator />
  }

  const summary = summarizeByCategory({ expenses, categories }).slice(
    0,
    TOP_CATEGORY_COUNT,
  )

  // Renders nothing at all rather than a heading over an empty list --
  // "Todavía no hay gastos este mes" is already the movements list's own
  // empty state, right above this one, illustration and all. A second and
  // third copy of the same sentence (this one, and PersonMiniSummary's)
  // added nothing but noise to an already-empty Home.
  if (summary.length === 0) {
    return null
  }

  // Title outside, each row its own card -- matches "Últimos movimientos"
  // above it, rather than the whole section living inside one shared card.
  return (
    <div className="flex w-full flex-col gap-3">
      <h2 className="text-title font-semibold self-start">Categorías</h2>
      <ul
        aria-label="Gastos por categoría"
        className="flex w-full flex-col gap-3 text-sm"
      >
        {summary.map((entry) => (
          <li
            key={entry.categoryId}
            className="bg-card shadow-resting flex items-center justify-between gap-2 rounded-2xl p-4"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                data-testid="category-swatch"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate text-foreground">{entry.name}</span>
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

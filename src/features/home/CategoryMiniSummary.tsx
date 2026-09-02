import { useQuery } from '@tanstack/react-query'
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
}

const TOP_CATEGORY_COUNT = 5

// Home-only mini-summary. Runs its own independent useQuery on the same
// expensesInMonthQueryKey/categoriesQueryKey cache entries
// RemainingBudgetDisplay already populates for the current month -- Tanstack
// Query's cache dedupes the underlying fetch as long as the key and query
// function shape match, so this doesn't cause an extra Firestore read.
export function CategoryMiniSummary({
  db,
  householdId,
}: CategoryMiniSummaryProps): ReactElement | null {
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
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  const expenses = expensesQuery.data
  const categories = categoriesQuery.data

  if (expenses === undefined || categories === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  const summary = summarizeByCategory({ expenses, categories }).slice(
    0,
    TOP_CATEGORY_COUNT,
  )

  // Renders nothing at all rather than a card repeating "Todavía no hay
  // gastos este mes" -- that message is already the movements list's own
  // empty state, right above this one, illustration and all. A second and
  // third copy of the same sentence (this one, and PersonMiniSummary's)
  // added nothing but noise to an already-empty Home.
  if (summary.length === 0) {
    return null
  }

  return (
    <div className="bg-card shadow-resting flex w-full flex-col gap-3 rounded-2xl p-4">
      <h2 className="text-title font-semibold">Categorías</h2>
      <ul aria-label="Gastos por categoría" className="flex flex-col gap-2">
        {summary.map((entry) => (
          <li
            key={entry.categoryId}
            className="flex items-center justify-between gap-2 text-sm"
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

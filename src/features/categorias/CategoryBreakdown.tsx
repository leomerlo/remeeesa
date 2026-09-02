import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
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
  summarizeByPerson,
} from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { CategoryDonut } from './CategoryDonut'

export type CategoryBreakdownProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

function formatShare(share: number): string {
  return `${String(Math.round(share * 100))}%`
}

// This month's spend, split by category and by person. Reads the same
// month-scoped cache entry Home's mini-summaries already populate, so opening
// this screen after Home costs no extra Firestore reads.
export function CategoryBreakdown({
  db,
  householdId,
}: CategoryBreakdownProps): ReactElement {
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

  const byCategory = summarizeByCategory({ expenses, categories })
  const byPerson = summarizeByPerson({ expenses })
  const total = byCategory.reduce((sum, entry) => sum + entry.total, 0)

  // An empty month gets the illustration and a sentence, never a donut with
  // no arcs -- a ring drawn from zero slices reads as a broken chart.
  if (byCategory.length === 0) {
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <Illustration src={categoriesCalc} className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos este mes
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <section
        aria-labelledby="por-categoria-heading"
        className="bg-card shadow-resting flex w-full flex-col gap-4 rounded-3xl p-6"
      >
        {/* The month's total rides in the heading row rather than inside the
            donut's hole: "$250.000,00" is far wider than the hole and used to
            spill over the ring. */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="por-categoria-heading" className="text-title font-semibold">
            Por categoría
          </h2>
          <span className="text-foreground shrink-0 font-semibold">
            {formatCurrency(total)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <CategoryDonut summary={byCategory} />
          <ul
            aria-label="Gastos por categoría"
            className="flex min-w-0 flex-1 flex-col gap-2 text-sm"
          >
            {byCategory.map((entry) => (
              <li
                key={entry.categoryId}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    data-testid="category-swatch"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-foreground truncate">{entry.name}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-muted-foreground text-xs">
                    {formatShare(entry.share)}
                  </span>
                  <span className="text-foreground font-medium">
                    {formatCurrency(entry.total)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="por-persona-heading"
        className="bg-card shadow-resting flex w-full flex-col gap-4 rounded-3xl p-6"
      >
        <h2 id="por-persona-heading" className="text-title font-semibold">
          Por persona
        </h2>
        {/* Bars rather than a second donut: two or three people with wildly
            different totals compare far more easily side by side than as
            arcs of the same ring. */}
        <ul
          aria-label="Gastos por persona"
          className="flex flex-col gap-3 text-sm"
        >
          {byPerson.map((entry) => (
            <li key={entry.authorDisplayName} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground truncate">
                  {entry.authorDisplayName}
                </span>
                <span className="text-foreground font-medium">
                  {formatCurrency(entry.total)}
                </span>
              </div>
              <div
                role="presentation"
                className="bg-muted h-2 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full rounded-full"
                  style={{
                    width: `${String(
                      total > 0 ? Math.round((entry.total / total) * 100) : 0,
                    )}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { cssVars } from '@/lib/cssVars'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { Skeleton } from '@/components/ui/skeleton'
import {
  categoriesQueryKey,
  expensesInMonthQueryKey,
} from '@/features/expenses'
import {
  categoryBudgetRows,
  categoryDocumentId,
  categoryBudgetsOverspill,
  currentMonthRange,
  formatCurrency,
  isDateInCurrentMonth,
  listCategories,
  listExpensesInMonth,
  summarizeByCategory,
  summarizeTarjeta,
} from '@/lib/expenses'
import { RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { getHousehold } from '@/lib/households'
import type { CategoryBudgetRow } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from '@/features/household'
import { CategoryDonut } from './CategoryDonut'

export type CategoryBreakdownProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. Categorías passes the month picked in its
  // own MonthPager, so this reads whichever month is in view instead of
  // always the current one -- per direct feedback, an all-time breakdown is
  // too much at once, and even a fixed "this month" wasn't enough: seeing a
  // past month's split needed a way to page back to it.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

function formatShare(share: number): string {
  return `${String(Math.round(share * 100))}%`
}

// The viewed month's spend, split by category and by person. Reads the same
// month-scoped cache entry Home's mini-summaries already populate for the
// current month, so opening this screen after Home costs no extra Firestore
// reads for that one case.
export function CategoryBreakdown({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: CategoryBreakdownProps): ReactElement {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const isCurrentMonth = isDateInCurrentMonth(monthStart)
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

  // Still-unpaid bills count toward their category too, so this breakdown
  // reconciles with "Gastos del mes" (which also counts them). Same
  // key/shape as the budget cards' own pending query, so they share one
  // fetch.
  // Only to tell whether the ceilings add up to more than the household
  // has. Shares the key every other household read uses, so it is one fetch.
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId }),
    queryFn: () => getHousehold({ db, householdId }),
  })

  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })

  const expenses = expensesQuery.data
  const categories = categoriesQuery.data
  const pending = pendingQuery.data

  if (
    expenses === undefined ||
    categories === undefined ||
    pending === undefined
  ) {
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="flex w-full flex-col gap-8"
      >
        <span className="sr-only">Cargando…</span>
        <div className="bg-card flex w-full flex-col gap-4 rounded-3xl p-6">
          <Skeleton className="h-5 w-32" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-32 shrink-0 rounded-full" />
            <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
        <div className="bg-card flex w-full flex-col gap-4 rounded-3xl p-6">
          <Skeleton className="h-5 w-28" />
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const pendingInMonth = pendientesDueInMonth(pending, monthStart, monthEnd)
  const byCategory = summarizeByCategory({
    expenses,
    categories,
    pendientes: pendingInMonth,
  })
  // The category every card cuota and Resumen is filed under (find-or-created
  // by this name, so its id is fixed). Its row opens into the card breakdown
  // instead of linking to Histórico.
  const tarjetaId = categoryDocumentId({
    householdId,
    name: RESUMEN_CATEGORY_NAME,
  })
  const monthParam = `${String(monthStart.getFullYear())}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`
  const total = byCategory.reduce((sum, entry) => sum + entry.total, 0)
  const budgetRows = categoryBudgetRows({ categories, summaries: byCategory })
  const overspill = categoryBudgetsOverspill({
    categories,
    monthlyBudget: householdQuery.data?.monthlyBudget ?? 0,
  })

  // An empty month gets the illustration and a sentence, never a donut with
  // no arcs -- a ring drawn from zero slices reads as a broken chart. The
  // wording only names "este mes" for the current month -- the MonthPager
  // above already shows which month is in view for any other one, so
  // repeating its label here would be redundant.
  // A month with nothing in it still has its ceilings worth showing -- "$0
  // de $30.000" is the most useful moment of the month to look at one.
  if (byCategory.length === 0 && budgetRows.length === 0) {
    return (
      <EmptyState
        illustration={ILLUSTRATIONS.counting}
        title={
          isCurrentMonth
            ? 'Todavía no hay nada para repartir'
            : 'Mes sin gastos'
        }
        description="El desglose por categoría aparece apenas carguen el primer gasto."
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-8">
      {budgetRows.length === 0 ? null : (
        <section
          aria-labelledby="topes-heading"
          className="bg-card flex w-full flex-col gap-4 rounded-3xl p-6"
        >
          <h2 id="topes-heading" className="text-title font-semibold">
            Topes por categoría
          </h2>
          {overspill > 0 ? (
            // Not a refusal: the ceilings are allowed not to add up, and
            // capping more than the household has is a thing worth saying
            // rather than a thing worth blocking. Per direct feedback.
            <p className="bg-warning-surface text-warning rounded-2xl px-4 py-3 text-sm">
              Los topes suman {formatCurrency(overspill)} más que el presupuesto
              del mes.
            </p>
          ) : null}
          <ul className="flex w-full flex-col gap-4 text-sm">
            {budgetRows.map((row: CategoryBudgetRow) => (
              <li key={row.categoryId} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full bg-[var(--swatch-color)]"
                      style={cssVars({ '--swatch-color': row.color })}
                    />
                    <span className="text-foreground truncate">{row.name}</span>
                  </span>
                  <span className="text-foreground shrink-0 font-medium">
                    {formatCurrency(row.spent)} de {formatCurrency(row.budget)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${row.name}: ${String(row.percentUsed)}% del tope`}
                  aria-valuenow={row.percentUsed}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="bg-muted h-2 w-full overflow-hidden rounded-full"
                >
                  <div
                    className={cn(
                      'h-full w-[var(--progress)] rounded-full transition-[width]',
                      row.overBudget ? 'bg-error-strong' : 'bg-primary',
                    )}
                    style={cssVars({
                      '--progress': `${String(row.percentUsed)}%`,
                    })}
                  />
                </div>
                <span
                  className={cn(
                    'text-xs',
                    row.overBudget ? 'text-error' : 'text-muted-foreground',
                  )}
                >
                  {row.overBudget
                    ? `${formatCurrency(-row.remaining)} por encima del tope`
                    : `Quedan ${formatCurrency(row.remaining)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {byCategory.length === 0 ? null : (
        <section
          aria-labelledby="por-categoria-heading"
          className="bg-card flex w-full flex-col gap-4 rounded-3xl p-6"
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
          {/* Stacked on a phone, side by side once there is room. Sharing one
            row at 375px left the names with so little width that `truncate`
            ate them entirely, leaving rows of a colour dot and a number. */}
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            {/* A donut needs at least two slices to say anything. With one
              category it renders as a plain filled ring -- a big graphic
              whose only message is "100%", which the row underneath already
              states in words. */}
            {byCategory.length > 1 ? (
              <CategoryDonut summary={byCategory} />
            ) : null}
            <ul
              aria-label="Gastos por categoría"
              className="flex w-full min-w-0 flex-1 flex-col gap-2 text-sm"
            >
              {byCategory.map((entry) => {
                const row = (
                  <>
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        data-testid="category-swatch"
                        className="size-2.5 shrink-0 rounded-full bg-[var(--swatch-color)]"
                        style={cssVars({ '--swatch-color': entry.color })}
                      />
                      <span className="text-foreground truncate">
                        {entry.name}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5">
                      <span className="text-muted-foreground text-xs">
                        {formatShare(entry.share)}
                      </span>
                      <span className="text-foreground font-medium">
                        {formatCurrency(entry.total)}
                      </span>
                    </span>
                  </>
                )
                if (entry.categoryId !== tarjetaId) {
                  return (
                    <li key={entry.categoryId}>
                      <Link
                        to={`/historico?month=${monthParam}&category=${entry.categoryId}`}
                        className="flex min-w-0 flex-1 items-center justify-between gap-2"
                      >
                        {row}
                      </Link>
                    </li>
                  )
                }
                return (
                  <li key={entry.categoryId}>
                    <details>
                      <summary className="flex min-w-0 flex-1 cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                        {row}
                      </summary>
                      <ul
                        aria-label={`${entry.name} por categoría`}
                        className="border-border mt-2 ml-1 flex flex-col gap-1.5 border-l pl-4"
                      >
                        {summarizeTarjeta({
                          categoryId: entry.categoryId,
                          expenses,
                          pendientes: pendingInMonth,
                        }).map((line) => (
                          <li
                            key={line.name}
                            className="flex items-baseline justify-between gap-2"
                          >
                            <span className="text-muted-foreground truncate">
                              {line.name}
                            </span>
                            <span className="text-foreground shrink-0">
                              {formatCurrency(line.total)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      )}
    </div>
  )
}

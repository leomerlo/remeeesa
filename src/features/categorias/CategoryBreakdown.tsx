import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cssVars } from '@/lib/cssVars'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  formatAmount,
  formatCurrency,
  isDateInCurrentMonth,
  listCategories,
  listExpensesInMonth,
  summarizeByCategory,
  summarizeTarjeta,
} from '@/lib/expenses'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { inkForCategoryColor } from '@/lib/expenses/categoryColor'
import { budgetTone, budgetToneClass } from '@/lib/expenses'
import { RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { getHousehold, monthlyBudgetFor } from '@/lib/households'
import type { CategoryBudgetRow } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from '@/features/household'
import { CategoryDonut } from './CategoryDonut'

export type CategoryBreakdownProps = {
  // Rendered in the right-hand column under "Cerca del tope". A slot rather
  // than a sibling in the page: the two columns are this component's own
  // layout, and the month chart belongs in one of them.
  readonly trend?: ReactNode
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
  trend,
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
        <div className="bg-card card-surface flex w-full flex-col gap-4 rounded-3xl p-6">
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
        <div className="bg-card card-surface flex w-full flex-col gap-4 rounded-3xl p-6">
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
  // The ones worth raising, by the same ladder the budget card climbs:
  // anything past "there is room left" (see lib/expenses/budgetHeat).
  const atRisk = budgetRows.filter(
    (row) => budgetTone(row.percentUsed) !== 'sky',
  )
  const overspill = categoryBudgetsOverspill({
    categories,
    monthlyBudget:
      householdQuery.data === undefined
        ? 0
        : monthlyBudgetFor(householdQuery.data, monthStart),
  })

  // An empty month gets the illustration and a sentence, never a donut with
  // no arcs -- a ring drawn from zero slices reads as a broken chart. The
  // wording only names "este mes" for the current month -- the MonthPager
  // above already shows which month is in view for any other one, so
  // repeating its label here would be redundant.
  // A month with nothing in it still has its ceilings worth showing -- "$0
  // de $30.000" is the most useful moment of the month to look at one.
  // atRisk/overspill rather than budgetRows: since only the ceilings a month
  // is actually near are listed, a month with nothing spent and a ceiling
  // set rendered neither the breakdown nor the ceilings panel -- a blank
  // screen with nothing on it at all. If there is nothing to show, show the
  // empty state.
  if (byCategory.length === 0 && atRisk.length === 0 && overspill === 0) {
    return (
      <EmptyState
        illustration={ILLUSTRATIONS.counting}
        title={
          isCurrentMonth
            ? 'Todavía no hay nada para repartir'
            : 'Mes sin gastos'
        }
        description="El desglose por categoría aparece apenas carguen el primer gasto."
        action={
          <Button asChild>
            <Link to="/">Ir a Inicio</Link>
          </Button>
        }
      />
    )
  }

  return (
    // Two columns from `lg`, and the right one is its own flex column so
    // what is in it simply stacks. Placing each section in an explicit grid
    // row instead -- which is what this did -- left a gap between the two
    // short panels whenever the tall one beside them was taller than both
    // put together. Per direct feedback: they have to read as one
    // continuous column whose height is whatever its contents need.
    <div className="flex w-full flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
      {/* Column one: the tall list of every category. */}
      {byCategory.length === 0 ? null : (
        <section
          aria-labelledby="por-categoria-heading"
          className="flex w-full flex-col gap-3"
        >
          <h2 id="por-categoria-heading" className="text-title font-semibold">
            Gastos por categoría
          </h2>
          {/* The same shape Home's panel has, per direct feedback: the ring
            carrying the month's total in its hole, and the rows under it
            separated by rules rather than packed into a gap. The total used
            to ride in the heading row because the hole could not hold a
            full peso figure -- the donut now prints a rounded one, which
            fits, and the exact figures are the rows themselves. */}
          <div className="bg-card card-surface divide-border-subtle flex w-full flex-col divide-y rounded-2xl text-sm">
            {/* A donut needs at least two slices to say anything. With one
              category it renders as a plain filled ring -- a big graphic
              whose only message is "100%", which the row underneath already
              states in words. */}
            {byCategory.length > 1 ? (
              <div className="flex justify-center p-5">
                <CategoryDonut summary={byCategory} total={total} />
              </div>
            ) : null}
            <ul
              aria-label="Gastos por categoría"
              className="divide-border-subtle flex w-full min-w-0 flex-col divide-y"
            >
              {byCategory.map((entry) => {
                const row = (marker?: ReactElement) => (
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
                      <span className="flex flex-col items-end">
                        {/* The peso figure is the one the share and the
                            donut are about. A category that also saw
                            dollars says so on its own line underneath --
                            never added in, since there is no rate this app
                            will pick. Per direct feedback. */}
                        <span className="text-foreground font-medium">
                          {formatCurrency(entry.total)}
                        </span>
                        {entry.totalUsd === 0 ? null : (
                          <span className="text-muted-foreground text-xs">
                            {formatAmount(entry.totalUsd, 'USD')}
                          </span>
                        )}
                      </span>
                      {marker}
                    </span>
                  </>
                )
                if (entry.categoryId !== tarjetaId) {
                  return (
                    <li key={entry.categoryId}>
                      <Link
                        to={`/historico?month=${monthParam}&category=${entry.categoryId}`}
                        className="hover:bg-muted/50 flex min-w-0 flex-1 items-center justify-between gap-2 p-4 transition-colors"
                      >
                        {row()}
                      </Link>
                    </li>
                  )
                }
                return (
                  <li key={entry.categoryId}>
                    <details className="group">
                      <summary className="hover:bg-muted/50 flex min-w-0 flex-1 cursor-pointer list-none items-center justify-between gap-2 p-4 transition-colors [&::-webkit-details-marker]:hidden">
                        {row(
                          <ChevronDown
                            aria-hidden="true"
                            className="text-muted-foreground size-4 self-center transition-transform group-open:rotate-180"
                          />,
                        )}
                      </summary>
                      <ul
                        aria-label={`${entry.name} por categoría`}
                        // mr-4 matches the padding the summary row above it
                        // carries: without it the nested list ran to the
                        // card's own edge and the amounts spilled past it.
                        className="border-border mr-4 mb-4 ml-5 flex flex-col gap-1.5 border-l pl-4"
                      >
                        {summarizeTarjeta({
                          categoryId: entry.categoryId,
                          expenses,
                          pendientes: pendingInMonth,
                        }).map((line, index, lines) => (
                          // Index, not name: a purchase category may itself
                          // be called "Ajuste" or "Sin pagar".
                          <li key={index} className="flex flex-col gap-1.5">
                            {/* The three kinds are not the same money, so
                                the first line of each says which it is.
                                What is estimated counts towards nothing --
                                it is the household's own record of consumos
                                whose statement has not arrived -- and is
                                greyed and labelled as such. Per direct
                                feedback: tiene que quedar muy en claro esa
                                identificación. */}
                            {index === 0 ||
                            lines[index - 1]?.kind !== line.kind ? (
                              <span className="text-muted-foreground mt-1.5 text-xs font-semibold tracking-wide uppercase">
                                {line.kind === 'pagado'
                                  ? 'Pagado del resumen'
                                  : line.kind === 'sinPagar'
                                    ? 'Llegó y falta pagar'
                                    : 'Todavía sin resumen · no suma'}
                              </span>
                            ) : null}
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="text-muted-foreground truncate">
                                {line.name}
                              </span>
                              <span
                                className={
                                  line.kind === 'estimado'
                                    ? 'text-muted-foreground shrink-0'
                                    : 'text-foreground shrink-0'
                                }
                              >
                                {formatCurrency(line.total)}
                              </span>
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
      {/* Column two: the two short panels, stacked, plus whatever the
          page hands in beside them (the month-to-month chart). They are
          one flex column so their heights are simply their contents. */}
      <div className="flex w-full flex-col gap-8">
        {/* Outside the "Cerca del tope" section, not inside it: this is
            about the ceilings themselves, not about how the month is going,
            so it has to be sayable in a month where nothing is near its
            ceiling at all -- which is exactly when a household has just
            finished setting them. */}
        {overspill > 0 ? (
          <p className="bg-warning-surface text-warning rounded-xl px-4 py-3 text-sm">
            Los topes suman {formatCurrency(overspill)} más que el presupuesto
            del mes.
          </p>
        ) : null}
        {atRisk.length === 0 ? null : (
          <section
            aria-labelledby="topes-heading"
            className="flex w-full flex-col gap-3"
          >
            {/* Title outside, one card per ceiling -- the same shape "Por
                categoría" below has. As one panel holding a stack of bars it
                read as a single thing with several readings in it; each
                ceiling is its own thing, with its own figure and its own
                verdict.

                Only the ones actually near their ceiling: a category with a
                tope and almost nothing spent on it is not news, and listing
                every one of them buried the one that was about to go over.
                Each category's own tope is printed on its tile in "Tus
                categorías" either way. Per direct feedback. */}
            <h2 id="topes-heading" className="text-title font-semibold">
              Cerca del tope
            </h2>
            {/* A plain list: these sit in the narrow column beside the
                breakdown now, where two across would leave each card too
                narrow for the figure it carries. */}
            <ul className="flex w-full flex-col gap-3 text-sm">
              {atRisk.map((row: CategoryBudgetRow) => {
                const CategoryIcon = iconForCategoryName(row.name)
                return (
                  <li
                    key={row.categoryId}
                    className="bg-card card-surface flex items-start gap-3 rounded-2xl p-4"
                  >
                    {/* The category's own icon, as everywhere else it appears --
                      a bare colour dot made this the one place in the app
                      where a category was a swatch and nothing else. Per
                      direct feedback. */}
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
                      style={cssVars({
                        '--swatch-color': row.color,
                        '--swatch-ink': inkForCategoryColor(row.color),
                      })}
                    >
                      <CategoryIcon
                        className="size-5 text-[var(--swatch-ink)]"
                        aria-hidden="true"
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* Name, then the figure, then the meta -- the same
                          order every card in the app reads in. The two used
                          to share a line as "$63.000 de $50.000", one run of
                          text at one weight, where the number that matters
                          was indistinguishable from the one it is measured
                          against. Per direct feedback. */}
                      <span className="text-foreground truncate font-bold">
                        {row.name}
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="money text-foreground text-lg">
                          {formatCurrency(row.spent)}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          de {formatCurrency(row.budget)}
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
                          // The same ladder the budget card on Home climbs --
                          // celeste while there is room, fucsia once it is
                          // tight, rojo at the limit. A category's ceiling and
                          // the month's budget are the same question asked at
                          // two scales, so they are answered in the same
                          // colours. Per direct feedback.
                          className={cn(
                            'h-full w-[var(--progress)] rounded-full transition-[width]',
                            budgetToneClass(budgetTone(row.percentUsed)),
                          )}
                          style={cssVars({
                            '--progress': `${String(row.percentUsed)}%`,
                          })}
                        />
                      </div>
                      <span
                        className={cn(
                          'text-xs',
                          row.overBudget
                            ? 'text-error'
                            : 'text-muted-foreground',
                        )}
                      >
                        {row.overBudget
                          ? `${formatCurrency(-row.remaining)} por encima del tope`
                          : `Quedan ${formatCurrency(row.remaining)}`}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
        {trend}
      </div>
    </div>
  )
}

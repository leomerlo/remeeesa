import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isNextCycleAfterAPaidThisPeriod,
  isSupersededByNextCycle,
  listPendientesForMonth,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import {
  currentMonthRange,
  formatBudgetAmount,
  listCategories,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type PorPagarSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onMarkPaid: (pendiente: Pendiente, categoryName: string) => void
  // Defaults to the current month. MonthNavigator's viewed month flows down
  // to this the same way it does to RecentExpensesList, so paging back a
  // month shows what was actually paid that month, not always "right now".
  // Pending items ignore this and always show regardless of viewed month --
  // see listPendientesForMonth.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

const HOME_PREVIEW_LIMIT = 5

// Home's "Cuentas por pagar": every currently-pending Pendiente plus
// whichever ones were paid this month, as a vertical list matching
// RecentExpensesList's row style (per direct feedback -- this used to be a
// horizontally-scrolling carousel). A pending row's whole card is a single
// tap target into the mark-paid flow, same as before; a paid row is
// display-only, marked with a check badge and "Pagado" instead of a due
// date -- there's nothing left to do with it here.
//
// Reads the same pendientesQueryKey prefix every other Pendiente view reads
// (suffixed with the viewed month's timestamp, same convention as
// RecentExpensesList/expensesInMonthQueryKey), so a mutation from any screen
// still refreshes this section -- invalidateQueries matches by prefix.
export function PorPagarSection({
  db,
  householdId,
  onMarkPaid,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: PorPagarSectionProps): ReactElement | null {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const pendientesQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), monthStart.getTime()],
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientesForMonth({ db, householdId, monthStart, monthEnd }),
        listCategories({ db, householdId }),
      ])
      return { pendientes, categories }
    },
  })

  // Its own skeleton rather than a shared page-level one: this section sits
  // between the budget hero and the movements list, both of which load
  // independently, so a single blocking spinner for all three would make the
  // whole screen feel slower than it is.
  if (pendientesQuery.isPending) {
    return (
      <section aria-labelledby="por-pagar-heading" className="w-full">
        <h2 id="por-pagar-heading" className="text-title font-semibold">
          Cuentas por pagar
        </h2>
        <div
          role="status"
          aria-label="Cargando…"
          className="mt-3 flex w-full flex-col gap-3"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4"
            >
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // A failed preview must not take Home down with it -- the budget and the
  // movements list are still perfectly usable, so this degrades to nothing
  // rather than to a page-level error.
  if (pendientesQuery.isError) {
    return null
  }

  const { pendientes, categories } = pendientesQuery.data

  // A paid pendiente whose next cycle is already in this same list is
  // redundant with that next cycle's own "Ya pagaste este mes" badge --
  // showing both reads as the same bill duplicated, not two months of one
  // series. Per direct feedback. The lookup below still checks against the
  // full `pendientes` array (not this filtered one), since that's what the
  // badge match needs to find.
  const visiblePendientes = pendientes.filter(
    (pendiente) => !isSupersededByNextCycle(pendiente, pendientes),
  )

  // Nothing pending and nothing paid this month: render nothing at all, not
  // an empty box.
  if (visiblePendientes.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  // listPendientesForMonth already returns pending (soonest-due-first) ahead
  // of paid-this-month (most-recently-paid-first), so this is a plain head
  // slice, not a re-sort.
  const preview = visiblePendientes.slice(0, HOME_PREVIEW_LIMIT)
  const hasOverflow = visiblePendientes.length > HOME_PREVIEW_LIMIT

  return (
    <section aria-labelledby="por-pagar-heading" className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="por-pagar-heading" className="text-title font-semibold">
          Cuentas por pagar
        </h2>
        {hasOverflow ? (
          <Link
            to="/pendientes"
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            Ver todas
          </Link>
        ) : null}
      </div>
      <ul
        aria-label="Pendientes por pagar"
        className="mt-3 flex w-full flex-col gap-3 text-sm"
      >
        {preview.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)
          const isPaid = pendiente.status === 'paid'
          // A recurring pendiente's next cycle is a brand-new row with no
          // link back to the one just paid -- without this, "Gimnasio" due
          // next month reads as an outstanding debt due *now*, when this
          // month's was already settled. Per direct feedback.
          const isNextCycle = isNextCycleAfterAPaidThisPeriod(
            pendiente,
            pendientes,
          )

          const amount =
            pendiente.expectedAmount !== null ? (
              <span className="font-display text-lg text-foreground">
                {formatBudgetAmount(pendiente.expectedAmount)}
              </span>
            ) : pendiente.recurring ? (
              // Same placeholder RecentExpensesList/PendientesList use for a
              // recurring pendiente with no amount yet -- a blank space here
              // reads as a rendering bug, not "not filled in yet".
              <span className="font-display text-muted-foreground text-lg">
                $ --,--
              </span>
            ) : null

          const rowContent = (
            <>
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  backgroundColor: isPaid
                    ? 'var(--color-green-100)'
                    : categoryColor,
                }}
              >
                {isPaid ? (
                  <Check className="text-green-700 size-5" aria-hidden="true" />
                ) : (
                  <CategoryIcon
                    className="size-5 text-white"
                    aria-hidden="true"
                  />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-foreground font-medium">
                    {pendiente.name}
                  </span>
                  {amount}
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {isNextCycle ? (
                    <>
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                        Ya pagaste este mes
                      </span>
                      <span aria-hidden="true">·</span>
                    </>
                  ) : null}
                  <span>{categoryName}</span>
                  <span aria-hidden="true">·</span>
                  {isPaid ? (
                    <span className="text-green-700 font-medium">Pagado</span>
                  ) : (
                    <span>{formatShortDate(pendiente.dueDate)}</span>
                  )}
                </div>
              </div>
            </>
          )

          return (
            <li key={pendiente.id}>
              {isPaid ? (
                <div className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4 opacity-70">
                  {rowContent}
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Marcar pagado ${pendiente.name}`}
                  className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                  onClick={() => {
                    onMarkPaid(pendiente, categoryName)
                  }}
                >
                  {rowContent}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

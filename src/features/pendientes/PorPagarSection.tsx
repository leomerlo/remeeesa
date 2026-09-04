import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isNextCycleAfterAPaidThisPeriod,
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

// Home's "Cuentas por pagar": every currently-pending Pendiente plus
// whichever ones were paid this month, all of them (no cap), as a
// horizontally-swipeable carousel of square cards ordered soonest-due-first
// -- per direct feedback, back to a carousel after a stint as a 2-column
// grid (and a vertical list before that), this time showing every item
// instead of a 5-card preview with a "Ver todas" overflow link. A pending
// card's whole area is a single tap target into the mark-paid flow, same as
// before; a paid card is also tappable, marked with a check badge and
// "Pagado" instead of a due date -- opening the same edit sheet with "Ya lo
// pagué" pre-checked, so a mistaken mark-paid can be undone.
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
          Servicios o pagos recurrentes
        </h2>
        <div
          role="status"
          aria-label="Cargando…"
          className="mt-3 flex w-full flex-nowrap gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-card shadow-resting flex aspect-square w-44 shrink-0 flex-col gap-2 rounded-2xl p-4"
            >
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="mt-auto flex flex-col gap-2">
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

  // Only what's still owed. A bill stops belonging here the moment it's
  // paid -- per direct feedback, a one-off ("Osde Flor", paid once and
  // done) lingering under "Cuentas por pagar" reads as something still to
  // do. What was paid lives on as an Expense, in Histórico.
  //
  // The full `pendientes` array (paid ones included) still feeds the badge
  // lookup below: that's what tells a freshly-spawned next cycle apart from
  // a genuinely outstanding bill.
  const visiblePendientes = pendientes.filter(
    (pendiente) => pendiente.status !== 'paid',
  )

  // Nothing outstanding: render nothing at all, not an empty box.
  if (visiblePendientes.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <section aria-labelledby="por-pagar-heading" className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="por-pagar-heading" className="text-title font-semibold">
          Servicios o pagos recurrentes
        </h2>
        {/* Not an overflow escape hatch any more (every pendiente shows in
            the carousel below) -- kept as the only way to reach Pendientes'
            own edit/delete management, which isn't in the bottom nav. */}
        <Link
          to="/pendientes"
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Ver todas
        </Link>
      </div>
      {/* Horizontally swipeable, scrollbar hidden -- a partially-cut-off
          card at the edge is the affordance, same pattern as CategoryChips. */}
      <ul
        aria-label="Pendientes por pagar"
        className="mt-3 flex w-full flex-nowrap gap-3 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visiblePendientes.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)
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

          const cardContent = (
            <>
              <span
                aria-hidden="true"
                className="flex size-11 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: categoryColor }}
              >
                <CategoryIcon
                  className="size-5 text-white"
                  aria-hidden="true"
                />
              </span>
              {/* Icon pinned to the top, name/amount/meta pinned to the
                  bottom -- the square aspect ratio leaves variable space
                  between them depending on how much text wraps. */}
              <div className="mt-auto flex min-w-0 flex-col gap-0.5">
                <span className="line-clamp-2 text-foreground font-medium">
                  {pendiente.name}
                </span>
                {amount}
                <div className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {isNextCycle ? (
                    <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs font-semibold">
                      Ya pagaste este mes
                    </span>
                  ) : null}
                  <span>{categoryName}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatShortDate(pendiente.dueDate)}</span>
                </div>
              </div>
            </>
          )

          return (
            <li key={pendiente.id} className="shrink-0">
              <button
                type="button"
                aria-label={`Marcar pagado ${pendiente.name}`}
                className="bg-card shadow-resting flex aspect-square w-44 flex-col gap-2 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                onClick={() => {
                  onMarkPaid(pendiente, categoryName)
                }}
              >
                {cardContent}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

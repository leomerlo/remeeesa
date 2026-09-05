import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  CarouselArrows,
  useCarouselControls,
} from '@/components/ui/carousel-arrows'
import { cssVars } from '@/lib/cssVars'
import { CategoryBadge } from '@/components/CategoryBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import {
  currentMonthRange,
  formatBudgetAmount,
  listCategories,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type PorPagarSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onMarkPaid: (pendiente: Pendiente, categoryName: string) => void
  // Defaults to the current month. MonthNavigator's viewed month flows down
  // to this the same way it does to RecentExpensesList: the section shows
  // what is still owed *for that month*.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

// Home's "Servicios o pagos recurrentes": every still-unpaid bill due in
// the viewed month, all of them (no cap), as a horizontally-swipeable
// carousel of square cards ordered soonest-due-first. Each card's whole
// area is a single tap target into the mark-paid flow.
//
// Two things are deliberately absent, both per direct feedback. A bill
// leaves the moment it is paid -- what was paid lives on as an Expense, in
// Histórico -- and a bill due in a later month does not appear yet. What is
// left is exactly the month's outstanding list, which is also precisely the
// pending figure "Gastos de este mes" and "Por categoría" count, so the
// section and the cards above it can no longer disagree.
//
// Note this means an unpaid bill from a past month shows under *that*
// month, not the current one; reaching it means paging back to it.
//
// Reads the same pendientesQueryKey prefix every other Pendiente view reads,
// so a mutation from any screen still refreshes this section --
// invalidateQueries matches by prefix. The fetch itself is month-independent
// (the month only narrows what is rendered), so the key carries no month and
// paging between months costs no extra read.
export function PorPagarSection({
  db,
  householdId,
  onMarkPaid,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
}: PorPagarSectionProps): ReactElement | null {
  const scrollerRef = useRef<HTMLUListElement>(null)
  const carousel = useCarouselControls(scrollerRef)
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const pendientesQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'with-categories'],
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientes({ db, householdId }),
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
              className="bg-card flex aspect-square w-[calc((100%-0.75rem)/2)] shrink-0 flex-col gap-2 rounded-2xl p-4 sm:w-[calc((100%-1.5rem)/3)]"
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

  // Still unpaid *and* due this month -- the same narrowing the budget
  // cards apply to the pending total they show.
  const visiblePendientes = pendientesDueInMonth(
    pendientes,
    monthStart,
    monthEnd,
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
      <h2 id="por-pagar-heading" className="text-title font-semibold">
        Servicios o pagos recurrentes
      </h2>
      {/* Cards are sized so a whole number of them fills the track at every
          width -- two on a phone, three once there is room -- and the track
          snaps, so it never comes to rest with a card sliced down the
          middle. Per direct feedback: "todo muy fit". The arrows above
          scroll it a full view at a time. */}
      <ul
        ref={scrollerRef}
        onScroll={carousel.onScroll}
        aria-label="Pendientes por pagar"
        className="mt-3 flex w-full snap-x snap-mandatory flex-nowrap gap-3 overflow-x-auto text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visiblePendientes.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)
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
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
                style={cssVars({ '--swatch-color': categoryColor })}
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
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <CategoryBadge name={categoryName} color={categoryColor} />
                  {/* Always its own line, whether or not it would have fit
                      beside the badge: a card whose date wraps next to one
                      whose date does not leaves the row looking ragged even
                      though the boxes are the same height. */}
                  <span className="w-full">
                    {formatDate(pendiente.dueDate)}
                  </span>
                </div>
              </div>
            </>
          )

          return (
            <li
              key={pendiente.id}
              className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/3)]"
            >
              <button
                type="button"
                aria-label={`Marcar pagado ${pendiente.name}`}
                className="bg-card flex aspect-square w-full flex-col gap-2 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
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
      {/* Both controls sit under the strip, not up beside the title: they
          act on what is below them, and on a phone a title long enough to
          wrap left them nowhere to go. Arrows on the left where the paging
          happens, the way out on the right. */}
      <div className="mt-3 flex items-center gap-2">
        <CarouselArrows controls={carousel} label="Servicios" />
        {/* Not an overflow escape hatch any more (every pendiente shows in
            the carousel above) -- kept as the only way to reach Servicios'
            own edit/delete management. */}
        <Button asChild variant="outline" className="ml-auto px-6">
          <Link to="/pendientes">Ver todas</Link>
        </Button>
      </div>
    </section>
  )
}

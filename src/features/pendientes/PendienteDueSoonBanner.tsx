import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ReactElement, UIEvent } from 'react'
import {
  CarouselArrows,
  useCarouselControls,
} from '@/components/ui/carousel-arrows'
import { CategoryBadge } from '@/components/CategoryBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatDate } from '@/lib/format'
import { listPendientes, pendientesDueSoon } from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { cn } from '@/lib/utils'
import { pendientesQueryKey } from './queryKeys'

export type PendienteDueSoonBannerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// Home's first content under the page title, above the month navigator and
// everything else -- there's no push notification in this app, so this is
// the only place a Pendiente's approaching due date surfaces on its own,
// without the user going to look for it. Purely informational: no tap
// action, nothing to dismiss, no unread state to track.
//
// One full-width row at a time (matching Cuentas por pagar / Últimos
// movimientos' own row width, not a chip), paged by swipe with dot
// indicators below -- per direct feedback, replacing the earlier row of
// small, partially-visible cards. Renders nothing at all (not an empty
// card, not a skeleton) whenever nothing is due soon, which is most of the
// time.
//
// Shares PorPagarSection's exact queryKey/queryFn shape ({ pendientes,
// categories }) so both read from the same cache entry instead of issuing a
// duplicate fetch -- see RecentExpensesList's comment on why the shape has
// to match exactly.
export function PendienteDueSoonBanner({
  db,
  householdId,
}: PendienteDueSoonBannerProps): ReactElement | null {
  const pendientesQuery = useQuery({
    queryKey: pendientesQueryKey({ householdId }),
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientes({ db, householdId }),
        listCategories({ db, householdId }),
      ])
      return { pendientes, categories }
    },
  })
  // One ref, two readers: the dots below track which page is showing, the
  // arrows track whether there is another one in each direction.
  const scrollerRef = useRef<HTMLUListElement>(null)
  const carousel = useCarouselControls(scrollerRef)
  const [activeIndex, setActiveIndex] = useState(0)

  if (pendientesQuery.isPending) {
    return (
      <section aria-label="Cargando…" role="status" className="w-full">
        <span className="sr-only">Cargando…</span>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-3 h-[84px] w-full rounded-2xl" />
      </section>
    )
  }

  // A failed chart must not take the rest of Home down with it -- everything
  // else is still perfectly usable, so this degrades to nothing.
  if (pendientesQuery.isError) {
    return null
  }

  const { pendientes, categories } = pendientesQuery.data
  const dueSoon = pendientesDueSoon(pendientes, new Date())
  if (dueSoon.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  function handleScroll(event: UIEvent<HTMLUListElement>): void {
    const container = event.currentTarget
    if (container.clientWidth === 0) {
      return
    }
    const index = Math.round(container.scrollLeft / container.clientWidth)
    setActiveIndex(index)
    // The dots and the arrows read the same scroll position; both have to
    // be told about it.
    carousel.onScroll()
  }

  function scrollToIndex(index: number): void {
    const container = scrollerRef.current
    if (container === null) {
      return
    }
    container.scrollTo({
      left: index * container.clientWidth,
      behavior: 'smooth',
    })
  }

  return (
    <section aria-labelledby="due-soon-heading" className="w-full">
      <div className="flex items-center justify-between gap-2">
        <h2 id="due-soon-heading" className="text-title font-semibold">
          Vencimientos que se acercan
        </h2>
        {dueSoon.length > 1 ? (
          <CarouselArrows controls={carousel} label="Vencimientos" />
        ) : null}
      </div>
      <ul
        ref={scrollerRef}
        onScroll={handleScroll}
        aria-label="Vencimientos próximos"
        className="mt-3 flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {dueSoon.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)

          return (
            // One card per view on a phone, two side by side from `lg` --
            // the row is far wider than one of these needs there. With two
            // or fewer due, that is the whole section and the arrows sit
            // disabled; past that it pages.
            <li
              key={pendiente.id}
              className="w-full shrink-0 snap-start lg:w-[calc((100%-1rem)/2)]"
            >
              {/* Same row shape as every other list on Home -- the only
                  deliberate difference is the color, tinted orange so it
                  reads as a heads-up rather than just another row. */}
              <div className="bg-orange-100 flex w-full items-center gap-3 rounded-2xl p-4">
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
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-foreground font-medium">
                      {pendiente.name}
                    </span>
                    {pendiente.expectedAmount !== null ? (
                      <span className="font-display text-lg text-foreground">
                        {formatBudgetAmount(pendiente.expectedAmount)}
                      </span>
                    ) : pendiente.recurring ? (
                      <span className="font-display text-muted-foreground text-lg">
                        $ --,--
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <CategoryBadge name={categoryName} color={categoryColor} />
                    <span className="text-warning font-medium">
                      Vence {formatDate(pendiente.dueDate)}
                    </span>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      {dueSoon.length > 1 ? (
        // Dots are one-per-card, which only reads as a page indicator while
        // a page *is* one card. From `lg` two share a view, so the arrows
        // are the pager there and these step aside.
        <div
          role="tablist"
          aria-label="Vencimiento visible"
          className="mt-2 flex w-full items-center justify-center gap-1.5 lg:hidden"
        >
          {dueSoon.map((pendiente, index) => (
            <button
              key={pendiente.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Vencimiento ${String(index + 1)} de ${String(dueSoon.length)}: ${pendiente.name}`}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                index === activeIndex ? 'bg-primary' : 'bg-muted',
              )}
              onClick={() => {
                scrollToIndex(index)
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ReactElement, UIEvent } from 'react'
import {
  CarouselArrows,
  useCarouselControls,
} from '@/components/ui/carousel-arrows'
import { Skeleton } from '@/components/ui/skeleton'
import { formatAmount, listCategories } from '@/lib/expenses'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatDate } from '@/lib/format'
import { listPendientes, pendientesDueSoon } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { cn } from '@/lib/utils'
import { ResumenSheet, resumenLabel } from './ResumenSheet'
import { pendientesQueryKey } from './queryKeys'

export type PendienteDueSoonBannerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Who pays a Resumen opened from here.
  readonly memberId: string
  readonly authorDisplayName: string
  // Opens the edit sheet with "Ya lo pagué" pre-checked, the same way
  // Cuentas por pagar does. A card's Resumen never goes through it -- it
  // has its own sheet, opened here.
  readonly onMarkPaid?: (pendiente: Pendiente, categoryName: string) => void
}

// Home's first content under the page title, above the month navigator and
// everything else -- there's no push notification in this app, so this is
// the only place a Pendiente's approaching due date surfaces on its own,
// without the user going to look for it. Tapping one is the way to pay it
// -- per direct feedback, if it is the thing about to come due, the obvious
// thing to want is to settle it. Nothing to dismiss, no unread state.
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
  memberId,
  authorDisplayName,
  onMarkPaid,
}: PendienteDueSoonBannerProps): ReactElement | null {
  const [openResumen, setOpenResumen] = useState<Pendiente | null>(null)
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
          <CarouselArrows
            controls={carousel}
            label="Vencimientos"
            // Shares its line with the section title, which already wraps at
            // 375px; on a phone the swipe is the gesture anyway. Gone from
            // `lg`, where the cards are stacked and nothing pages.
            className="hidden sm:flex lg:hidden"
          />
        ) : null}
      </div>
      <ul
        ref={scrollerRef}
        onScroll={handleScroll}
        aria-label="Vencimientos próximos"
        // A swipeable row on a phone, where it sits across the top of Home
        // and there is no room for a column. From `lg` it is Home's right
        // column instead, so it stops being a carousel entirely and just
        // stacks -- a pager for three cards you can already all see is a
        // control with nothing to do.
        className="mt-3 flex w-full snap-x snap-mandatory gap-3 overflow-x-auto [scrollbar-width:none] lg:snap-none lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {dueSoon.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const CategoryIcon = iconForCategoryName(categoryName)

          return (
            // One card per view on a phone, two side by side from `lg` --
            // the row is far wider than one of these needs there. With two
            // or fewer due, that is the whole section and the arrows sit
            // disabled; past that it pages.
            <li key={pendiente.id} className="w-full shrink-0 snap-start">
              {/* An ordinary card with a red outline, not a card filled
                  red. Filled, three of these across the top of Home were
                  the loudest thing on the screen by far -- louder than the
                  budget running out, which is the one figure that should
                  shout. The outline still says "these are the urgent ones"
                  without taking the page over. Per direct feedback.

                  None of its colours come from the category: whatever is
                  about to come due should read as one thing, not as five
                  differently-tinted things. */}
              <button
                type="button"
                aria-label={
                  pendiente.cardId === undefined
                    ? `Marcar pagado ${pendiente.name}`
                    : `Ver ${resumenLabel(pendiente)}`
                }
                onClick={() => {
                  if (pendiente.cardId === undefined) {
                    onMarkPaid?.(pendiente, categoryName)
                    return
                  }
                  setOpenResumen(pendiente)
                }}
                className="card-surface-error bg-card flex w-full items-start gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
              >
                <span
                  aria-hidden="true"
                  className="bg-error-surface flex size-11 shrink-0 items-center justify-center rounded-full"
                >
                  <CategoryIcon
                    className="text-error size-5"
                    aria-hidden="true"
                  />
                </span>
                {/* Everything stacked, the figure last and largest. The
                    badge used to share a line with the name, which in a
                    3-column sidebar on a laptop left the name about four
                    characters and a "Tarj…". Per direct feedback: stack
                    that too. */}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{pendiente.name}</span>
                  <span // Wraps rather than truncates: on its own line in a narrow
                    // sidebar column, "Tarjeta de crédito" cut to "Tarjeta de…"
                    // says less than two short lines do.
                    className="bg-muted text-muted-foreground w-fit max-w-full rounded px-1.5 py-0.5 text-xs font-medium"
                  >
                    {categoryName}
                  </span>
                  <span className="text-error text-xs font-medium">
                    Vence {formatDate(pendiente.dueDate)}
                  </span>
                  {pendiente.expectedAmount !== null ? (
                    <span className="money text-error text-xl">
                      {formatAmount(
                        pendiente.expectedAmount,
                        pendiente.currency ?? 'ARS',
                      )}
                    </span>
                  ) : pendiente.recurring ? (
                    <span className="money text-muted-foreground text-xl">
                      $ --,--
                    </span>
                  ) : null}
                </div>
              </button>
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
      {/* A card bill opens to its cuotas, never the generic Pendiente
          form -- the same split Cuentas por pagar makes. */}
      <ResumenSheet
        db={db}
        householdId={householdId}
        memberId={memberId}
        authorDisplayName={authorDisplayName}
        resumen={openResumen}
        onClose={() => {
          setOpenResumen(null)
        }}
      />
    </section>
  )
}

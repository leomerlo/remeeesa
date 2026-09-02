import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { listPendientes } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type PorPagarSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onMarkPaid: (pendiente: Pendiente, categoryName: string) => void
}

const HOME_PREVIEW_LIMIT = 5

// Home's "Cuentas por pagar" preview: the soonest-due pending Pendientes as a
// horizontally-scrollable row of compact cards, matching the approved Home
// comp. Deliberately a separate component from PendientesList rather
// than a parameterization of it -- that one is the full vertical list on
// /pendientes, with edit and pay affordances per row; this one is a glanceable
// preview whose whole card is a single tap target into the mark-paid flow.
//
// Reads the same pendientesQueryKey every other Pendiente view reads, so a
// mutation from any screen refreshes this section with no extra wiring.
export function PorPagarSection({
  db,
  householdId,
  onMarkPaid,
}: PorPagarSectionProps): ReactElement | null {
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
          className="mt-3 flex gap-3 overflow-hidden"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="bg-card shadow-resting flex h-full w-36 shrink-0 flex-col gap-1.5 rounded-2xl p-3"
            >
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="mt-auto h-5 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
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

  // Nothing pending: render nothing at all, not an empty box.
  if (pendientes.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  // listPendientes already returns soonest-due-first, so this is a plain
  // head slice, not a re-sort.
  const preview = pendientes.slice(0, HOME_PREVIEW_LIMIT)
  const hasOverflow = pendientes.length > HOME_PREVIEW_LIMIT

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
      {/* Horizontal scroll, per the comp. -mx-6/px-6 lets the row bleed to
          the screen edges while the cards still align with the page's
          content gutter.
          scroll-px-6 is what makes that actually hold: snap-mandatory snaps
          to the first card's own start edge, which scrolled the 24px of left
          padding away and left the first card flush against the screen edge,
          a gutter out of line with every other section on Home.
          The scrollbar is hidden because it rendered as a grey bar sitting
          under the cards on desktop; the row is swipeable and the partially
          visible next card is the affordance. */}
      <ul
        aria-label="Pendientes por pagar"
        className="-mx-6 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {preview.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)

          return (
            // flex on the li + h-full on the card make every card stretch to
            // the tallest one, which is what gives the name/date block
            // below an actual bottom edge to anchor to via mt-auto. Without
            // it each card is only as tall as its own content and nothing
            // lines up across the row.
            <li key={pendiente.id} className="flex snap-start">
              <button
                type="button"
                aria-label={`Marcar pagado ${pendiente.name}`}
                className="bg-card shadow-resting flex h-full w-36 shrink-0 flex-col gap-1.5 rounded-2xl p-3 text-left transition-transform active:scale-[0.98]"
                onClick={() => {
                  onMarkPaid(pendiente, categoryName)
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: categoryColor }}
                >
                  <CategoryIcon
                    className="size-4 text-white"
                    aria-hidden="true"
                  />
                </span>
                {pendiente.expectedAmount !== null ? (
                  <span className="font-display text-base text-foreground">
                    {formatBudgetAmount(pendiente.expectedAmount)}
                  </span>
                ) : pendiente.recurring ? (
                  // A recurring bill with no amount yet reads as
                  // incomplete/broken with nothing where a price usually
                  // is -- a placeholder says "not filled in yet" instead of
                  // looking like a rendering bug. A one-off Pendiente with
                  // no amount is a different, deliberate case and stays
                  // blank.
                  <span className="font-display text-muted-foreground text-base">
                    $ --,--
                  </span>
                ) : null}
                {/* mt-auto bottom-anchors the name/date block: the expected
                    amount above is optional, so without this a card that
                    has no amount would sit its name where its neighbours
                    show their price, and nothing would line up across the
                    row. */}
                <span className="text-foreground mt-auto truncate text-sm font-medium">
                  {pendiente.name}
                </span>
                {/* Two lines rather than one truncated one: at w-36
                    "Servicios · 4 de sept de 2026" clipped to
                    "Servicios · 4 de sept de 2…", hiding the year. */}
                <span className="text-muted-foreground flex flex-col text-xs">
                  <span className="truncate">{categoryName}</span>
                  <span className="truncate">
                    {formatShortDate(pendiente.dueDate)}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

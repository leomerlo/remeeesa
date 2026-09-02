import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { listPendingCuentas } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { cuentasQueryKey } from './queryKeys'

export type PorPagarSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onMarkPaid: (cuenta: Cuenta) => void
}

const HOME_PREVIEW_LIMIT = 5

// Home's "Por pagar" preview: the soonest-due pending Cuentas as a
// horizontally-scrollable row of compact cards, matching the approved Home
// comp. Deliberately a separate component from PendingCuentasList rather
// than a parameterization of it -- that one is the full vertical list on
// /cuentas, with edit and pay affordances per row; this one is a glanceable
// preview whose whole card is a single tap target into the mark-paid flow.
//
// Reads the same cuentasQueryKey every other Cuenta view reads, so a
// mutation from any screen refreshes this section with no extra wiring.
export function PorPagarSection({
  db,
  householdId,
  onMarkPaid,
}: PorPagarSectionProps): ReactElement | null {
  const cuentasQuery = useQuery({
    queryKey: cuentasQueryKey({ householdId }),
    queryFn: async () => {
      const [cuentas, categories] = await Promise.all([
        listPendingCuentas({ db, householdId }),
        listCategories({ db, householdId }),
      ])
      return { cuentas, categories }
    },
  })

  // Its own skeleton rather than a shared page-level one: this section sits
  // between the budget hero and the movements list, both of which load
  // independently, so a single blocking spinner for all three would make the
  // whole screen feel slower than it is.
  if (cuentasQuery.isPending) {
    return (
      <section aria-labelledby="por-pagar-heading" className="w-full">
        <h2 id="por-pagar-heading" className="text-title font-semibold">
          Por pagar
        </h2>
        <p role="status" className="mt-3 text-sm font-medium">
          Cargando…
        </p>
      </section>
    )
  }

  // A failed preview must not take Home down with it -- the budget and the
  // movements list are still perfectly usable, so this degrades to nothing
  // rather than to a page-level error.
  if (cuentasQuery.isError) {
    return null
  }

  const { cuentas, categories } = cuentasQuery.data

  // Nothing pending: render nothing at all, not an empty box.
  if (cuentas.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  // listPendingCuentas already returns soonest-due-first, so this is a plain
  // head slice, not a re-sort.
  const preview = cuentas.slice(0, HOME_PREVIEW_LIMIT)
  const hasOverflow = cuentas.length > HOME_PREVIEW_LIMIT

  return (
    <section aria-labelledby="por-pagar-heading" className="w-full">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="por-pagar-heading" className="text-title font-semibold">
          Por pagar
        </h2>
        {hasOverflow ? (
          <Link
            to="/cuentas"
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
        aria-label="Cuentas por pagar"
        className="-mx-6 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {preview.map((cuenta) => {
          const category = categoryById.get(cuenta.categoryId)
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
            <li key={cuenta.id} className="flex snap-start">
              <button
                type="button"
                aria-label={`Marcar pagada ${cuenta.name}`}
                className="bg-card shadow-resting flex h-full w-44 shrink-0 flex-col gap-2 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                onClick={() => {
                  onMarkPaid(cuenta)
                }}
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: categoryColor }}
                >
                  <CategoryIcon
                    className="size-5 text-white"
                    aria-hidden="true"
                  />
                </span>
                {cuenta.expectedAmount !== null ? (
                  <span className="font-display text-lg text-foreground">
                    {formatBudgetAmount(cuenta.expectedAmount)}
                  </span>
                ) : null}
                {/* mt-auto bottom-anchors the name/date block: the expected
                    amount above is optional, so without this a card that
                    has no amount would sit its name where its neighbours
                    show their price, and nothing would line up across the
                    row. */}
                <span className="text-foreground mt-auto truncate font-medium">
                  {cuenta.name}
                </span>
                {/* Two lines rather than one truncated one: at w-44
                    "Servicios · 4 de sept de 2026" clipped to
                    "Servicios · 4 de sept de 2…", hiding the year. */}
                <span className="text-muted-foreground flex flex-col text-xs">
                  <span className="truncate">{categoryName}</span>
                  <span className="truncate">
                    {formatShortDate(cuenta.dueDate)}
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

import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { cardsDueNextMonthTotal, RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import {
  colorForCategoryName,
  inkForCategoryColor,
} from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { cssVars } from '@/lib/cssVars'
import type { HouseholdsDb } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import { pendientesQueryKey } from './queryKeys'

export type CardsNextMonthProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// Home's "Tarjetas el mes que viene": what the cards will ask for in the
// calendar month after today, whichever month Home is showing -- the bill
// that should never catch the household by surprise.
//
// Same queryKey and { pendientes, categories } shape as
// PendienteDueSoonBanner, so the two share one fetch.
// Resolved once at module level, not per render: the name is a constant, so
// the icon is too -- and looking a component up inside the render body is
// what react-hooks/static-components is there to catch.
const ResumenIcon = iconForCategoryName(RESUMEN_CATEGORY_NAME)

export function CardsNextMonth({
  db,
  householdId,
}: CardsNextMonthProps): ReactElement | null {
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

  // A glance figure, not a page section: nothing while loading or on error,
  // and nothing when no card is due.
  if (pendientesQuery.data === undefined) {
    return null
  }
  const total = cardsDueNextMonthTotal(
    pendientesQuery.data.pendientes,
    new Date(),
  )
  if (total === 0) {
    return null
  }

  // Its own category's colour and icon, the same pair every servicio row on
  // this page wears. As a bare line of grey text it read as a footnote
  // between two sections and went straight past -- which for the one figure
  // that says what is coming is the opposite of what it is for. Per direct
  // feedback.
  const category = pendientesQuery.data.categories.find(
    (candidate) => candidate.name === RESUMEN_CATEGORY_NAME,
  )
  const color = category?.color ?? colorForCategoryName(RESUMEN_CATEGORY_NAME)

  return (
    <section
      aria-labelledby="tarjetas-mes-que-viene-heading"
      className="bg-card card-surface flex w-full items-center gap-3 rounded-2xl p-4"
      style={cssVars({
        '--swatch-color': color,
        '--swatch-ink': inkForCategoryColor(color),
      })}
    >
      <span
        aria-hidden="true"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
      >
        <ResumenIcon
          className="size-5 text-[var(--swatch-ink)]"
          aria-hidden="true"
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2
          id="tarjetas-mes-que-viene-heading"
          className="text-foreground text-sm font-medium"
        >
          Tarjetas el mes que viene
        </h2>
        <span className="text-muted-foreground text-xs">
          Lo que van a pedir los resúmenes
        </span>
      </div>
      <span className="money text-foreground shrink-0 text-xl">
        {formatBudgetAmount(total)}
      </span>
    </section>
  )
}

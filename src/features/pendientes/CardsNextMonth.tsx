import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { cardsDueNextMonthTotal } from '@/lib/cards'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
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

  return (
    <section
      aria-labelledby="tarjetas-mes-que-viene-heading"
      className="bg-card flex w-full items-baseline justify-between gap-3 rounded-2xl p-4"
    >
      <h2
        id="tarjetas-mes-que-viene-heading"
        className="text-muted-foreground text-sm font-medium"
      >
        Tarjetas el mes que viene
      </h2>
      <span className="font-display text-foreground shrink-0 text-lg">
        {formatBudgetAmount(total)}
      </span>
    </section>
  )
}

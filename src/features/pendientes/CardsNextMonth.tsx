import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { cardsDueNextMonth } from '@/lib/cards'
import { listCategories } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'
import { CardsSummaryCard } from './CardsSummaryCard'
import { pendientesQueryKey } from './queryKeys'

export type CardsNextMonthProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // The month Home is showing. The figure is for the month after it, so
  // paging Home moves this with it -- it used to be pinned to the real
  // calendar month and showed the same number whatever month was on
  // screen. Per direct feedback.
  readonly monthStart: Date
}

// Home's "Tarjetas el mes que viene": what the cards will ask for in the
// calendar month after the one being looked at -- the bill that should
// never catch the household by surprise.
//
// Same queryKey and { pendientes, categories } shape as
// PendienteDueSoonBanner, so the two share one fetch.
//
// The card itself is CardsSummaryCard, which Servicios shows too: this
// component is only the part that decides *which* statements -- next
// month's, seen from the month on screen.
export function CardsNextMonth({
  db,
  householdId,
  monthStart,
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
  const resumenes = cardsDueNextMonth(
    pendientesQuery.data.pendientes,
    monthStart,
  )

  // The same block Servicios shows over this month's statements, so the two
  // screens cannot drift into looking like different things.
  return (
    <CardsSummaryCard
      db={db}
      householdId={householdId}
      resumenes={resumenes}
      categories={pendientesQuery.data.categories}
      title="Tarjetas el mes que viene"
      subtitle="Lo que van a pedir los resúmenes"
      headingId="tarjetas-mes-que-viene-heading"
    />
  )
}

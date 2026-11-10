import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { MonthPager } from '@/features/expenses'
import { currentMonthRange } from '@/lib/expenses'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { CategoryBreakdown } from './CategoryBreakdown'
import { CategoryManager } from './CategoryManager'
import { MonthlyTotalsChart } from './MonthlyTotalsChart'

export type CategoriasPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function CategoriasPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: CategoriasPageProps): ReactElement {
  const { currentUserId, db, membership } = useHouseholdMembership({
    ...(currentUserIdProp === undefined
      ? {}
      : { currentUserId: currentUserIdProp }),
    ...(householdsDb === undefined ? {} : { householdsDb }),
  })
  // Owned here, not inside CategoryBreakdown, so the whole "Por categoría"/
  // "Por persona" section moves together when paged -- same pattern as
  // Home's MonthNavigator. Per direct feedback: an all-time breakdown is too
  // much at once, and a breakdown fixed to the current month wasn't enough
  // either -- there needs to be a way to page back to any other month.
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)

  const header = <PageHeader title="Categorías" />

  // Signed-out is checked before membership: membership only ever resolves
  // for a signed-in user, so folding the two undefined cases together would
  // leave this screen stuck on "Cargando…" forever for a signed-out visitor.
  if (currentUserId === undefined) {
    return (
      <div className="flex w-full flex-col items-center gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col items-center gap-8">
        {header}
        <EmptyState
          illustration={ILLUSTRATIONS.counting}
          title="Todavía no hay nada para repartir"
          description="El desglose por categoría aparece apenas carguen el primer gasto."

          action={
            <Button asChild>
              <Link to="/">Ir a Inicio</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (membership === undefined) {
    return (
      <div className="flex w-full flex-col items-center gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      {header}
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
      />
      {/* One column on a phone; two from `lg`. The breakdown is a tall
          list, so it takes a column of its own and the two short things --
          what is near its ceiling, and the month-to-month shape -- stack in
          the other. The sections are direct children of this grid rather
          than of their own components: CategoryBreakdown's wrapper goes
          `display: contents` at the same breakpoint, which lets its two
          sections take their own places in here. Per direct feedback. */}
      {/* The two columns are CategoryBreakdown's own layout -- the chart
          goes into its right-hand one as a slot, under "Cerca del tope",
          so the three panels sit where they belong without the page having
          to place each one in a grid cell. */}
      <CategoryBreakdown
        db={db}
        householdId={membership.householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
        trend={
          <MonthlyTotalsChart db={db} householdId={membership.householdId} />
        }
      />
      <CategoryManager
        db={db}
        householdId={membership.householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
    </div>
  )
}

import { useState } from 'react'
import type { ReactElement } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/PageHeader'
import { Illustration } from '@/components/Illustration'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
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
      <div className="flex w-full flex-col items-center gap-6">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col items-center gap-6">
        {header}
        <Illustration src={categoriesCalc} className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos este mes
        </p>
      </div>
    )
  }

  if (membership === undefined) {
    return (
      <div className="flex w-full flex-col items-center gap-6">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      {header}
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
      />
      <CategoryBreakdown
        db={db}
        householdId={membership.householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
      <MonthlyTotalsChart db={db} householdId={membership.householdId} />
      <CategoryManager db={db} householdId={membership.householdId} />
    </div>
  )
}

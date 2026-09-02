import type { ReactElement } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { PageHeader } from '@/components/PageHeader'
import { Illustration } from '@/components/Illustration'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
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
      <CategoryBreakdown db={db} householdId={membership.householdId} />
      <MonthlyTotalsChart db={db} householdId={membership.householdId} />
      <CategoryManager db={db} householdId={membership.householdId} />
    </div>
  )
}

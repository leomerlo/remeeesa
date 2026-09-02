import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Illustration } from '@/components/Illustration'
import categoriesCalc from '@/assets/illustrations/categories-calc.webp'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { CategoryBreakdown } from './CategoryBreakdown'

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
      <div className="flex w-full flex-col items-center gap-8">
        {header}
        <p role="status" className="text-sm font-medium">
          Cargando…
        </p>
      </div>
    )
  }

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col items-center gap-8">
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
      <div className="flex w-full flex-col items-center gap-8">
        {header}
        <p role="status" className="text-sm font-medium">
          Cargando…
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      {header}
      <CategoryBreakdown db={db} householdId={membership.householdId} />
    </div>
  )
}

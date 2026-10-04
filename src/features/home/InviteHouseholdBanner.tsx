import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Illustration } from '@/components/Illustration'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { allExpensesQueryKey } from '@/features/expenses'
import { membersQueryKey } from '@/features/household'
import { InviteLinkPanel } from '@/features/invite'
import { pendientesQueryKey } from '@/features/pendientes'
import { listAllExpenses } from '@/lib/expenses'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { listPendientes } from '@/lib/pendientes'

export type InviteHouseholdBannerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// The first thing a brand-new household sees, and the only thing on Home
// that is not about a month.
//
// A household is the unit this app is built on -- one budget, two or more
// people spending against it -- and somebody who sets it up alone has no
// reason to discover that until they go looking in Ajustes. So while the
// household is one person with nothing logged, Home says it out loud and
// hands over the link. Per direct feedback, replacing the "Empezá por acá"
// checklist that used to sit here.
//
// It disappears for good the moment either is no longer true: somebody
// joined, or they started using it on their own and have been told once.
export function InviteHouseholdBanner({
  db,
  householdId,
}: InviteHouseholdBannerProps): ReactElement | null {
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
  })
  // Every expense ever, not this month's: a household that logged something
  // in a past month is not new, it is just looking at an empty month.
  const expensesQuery = useQuery({
    queryKey: allExpensesQueryKey({ householdId }),
    queryFn: () => listAllExpenses({ db, householdId }),
  })
  // The 'all' suffix is not decoration: the bare pendientesQueryKey holds
  // `{ pendientes, categories }` for the sections that need both, and
  // 'committed' holds another shape again. A third reader with a fourth
  // shape has to be its own cache entry or it poisons theirs -- which is
  // exactly what it did here until the due-soon banner started crashing on
  // an array it was handed instead of an object.
  const pendientesQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'all'],
    queryFn: () => listPendientes({ db, householdId }),
  })

  const members = membersQuery.data
  const expenses = expensesQuery.data
  const pendientes = pendientesQuery.data
  // Nothing at all until all three answers are in: a banner that appears a
  // beat after the page has settled reads as something that went wrong.
  if (
    members === undefined ||
    expenses === undefined ||
    pendientes === undefined
  ) {
    return null
  }
  if (members.length > 1 || expenses.length > 0 || pendientes.length > 0) {
    return null
  }

  return (
    <section
      aria-labelledby="invite-banner-title"
      // An ordinary white card, like every other card in the app -- the
      // colour is in the disc, not the surface. A gradient banner would
      // have had to hold a read-only URL field and its label, and dark
      // controls on a violet fill is exactly the contrast trap the app's
      // coloured cards avoid by carrying nothing but figures.
      className="bg-card card-surface flex w-full flex-col gap-5 rounded-3xl p-6 lg:flex-row lg:items-center lg:gap-8"
    >
      {/* Violet: the one gradient of the four the budget ladder never uses,
          so colour on Home that is *not* about how the month is going
          cannot be mistaken for the budget turning a corner. */}
      <span
        aria-hidden="true"
        className="bg-stat-violet flex size-28 shrink-0 items-center justify-center self-center rounded-full"
      >
        <Illustration src={ILLUSTRATIONS.pleased} className="size-20" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="invite-banner-title" className="text-title font-semibold">
            ¿Son dos o más en la casa?
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            El presupuesto es uno solo y lo ven las dos personas. Mandale el
            link a quien vive con vos y cargan los gastos los dos.
          </p>
        </div>
        {/* The real panel from Ajustes, not a second copy of it: generating
            the token, showing the URL and copying it all behave exactly as
            they do there. */}
        <InviteLinkPanel db={db} householdId={householdId} />
      </div>
    </section>
  )
}

import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { Home } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { AddGastoSheet } from '@/features/expenses'
import { householdQueryKey } from '@/features/household'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getHousehold } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { useCurrentMembership } from './useShowNav'

export type AppHeaderProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

// The one bar that is on screen no matter which page you are on: the
// wordmark, and the name of the household you are in.
//
// The household name used to be Home's page title -- big and violet, and
// only on Home. Per direct feedback it belongs here instead: it is not a
// property of one screen, it says whose money every screen is showing. So
// it is persistent, and it is near-black rather than violet, because a
// heading in the action colour reads as something to press.
//
// Rendered by App.tsx above <main>, not by AppShell inside it -- a
// full-width bar, not boxed into the column every page's content sits in.
// Shares AppShell's membership lookup so the two appear and disappear
// together. From `lg` it is padded clear of the sidebar, which carries the
// wordmark there, so this bar is left with the household name alone.
export function AppHeader({
  currentUserId,
  householdsDb,
}: AppHeaderProps): ReactElement | null {
  const firebase = useFirebase()
  const [isAddGastoOpen, setIsAddGastoOpen] = useState(false)
  const membership = useCurrentMembership({ currentUserId, householdsDb })
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const householdId = membership?.householdId
  // Same key/queryFn shape the budget card already uses, so the two share
  // one cache entry rather than each fetching the household.
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId: householdId ?? '' }),
    queryFn: () => getHousehold({ db, householdId: householdId ?? '' }),
    enabled: householdId !== undefined,
  })

  if (membership === undefined || membership === null) {
    return null
  }

  return (
    // sticky rather than fixed: stays pinned once scrolled past, without
    // needing a matching compensation padding on <main> the way the fixed
    // bottom nav needs its pb-24 (AppShell) -- one less magic number to keep
    // in sync if the header's own height ever changes. z-30 matches the
    // nav's stacking layer; both sit well under Sheet/popover's z-50.
    <header className="bg-card sticky top-0 z-30 flex w-full items-center justify-between gap-3 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 sm:px-8 lg:pl-72">
      <Logo className="h-5 shrink-0 lg:hidden" />
      {/* Smaller than a page title on purpose: it shares a line with the
          wordmark on a phone, and it is a label for where you are rather
          than a heading for what you are reading.

          No flex-1: growing to fill the row left it sitting hard against
          the wordmark, reading as part of it. Sized to its own content, the
          header's justify-between pushes it to the opposite edge, which is
          where a label for "where you are" belongs. min-w-0 stays so a long
          household name still truncates instead of pushing the row wide.
          Per direct feedback. */}
      <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground lg:text-base">
        <Home className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{householdQuery.data?.name ?? 'Hogar'}</span>
      </span>
      {/* One add button in the app, in one place per form factor: up here
          beside the sidebar, and down in the bar's own raised button on a
          phone, where the thumb is (see AppShell). The header on a phone is
          only the wordmark and the household's name. Per direct feedback.

          It used to be desktop-only, so Histórico and Servicios each
          carried their own -- two buttons a screen apart opening the same
          form; a servicio is just a gasto with "se repite" ticked. */}
      <div className="hidden shrink-0 lg:block">
        <AddGastoSheet
          open={isAddGastoOpen}
          onOpenChange={setIsAddGastoOpen}

          db={db}
          householdId={membership.householdId}
          memberId={membership.userId}
          authorDisplayName={membership.displayName}
        />
      </div>
    </header>
  )
}

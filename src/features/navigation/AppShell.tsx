import { Fragment, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  History,
  Home,
  LayoutGrid,
  Receipt,
  Settings,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useSettleAutoDebits } from '@/features/pendientes'
import { useFirebase } from '@/lib/firebaseContext'
import { cn } from '@/lib/utils'
import { createFirestoreHouseholdsDb } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { AddGastoSheet } from '@/features/expenses'
import { DolarConverter } from './DolarConverter'
import { useCurrentMembership } from './useShowNav'

export type AppShellProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

type NavItem = {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
  readonly end: boolean
}

// Servicios sits between Histórico and Categorías at every width. It was
// desktop-only while the phone's bar was assumed to have room for only
// four, but it is a top-level destination and reaching it sideways from
// Home was never right. Per direct feedback.
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/historico', label: 'Histórico', icon: History, end: false },
  { to: '/pendientes', label: 'Servicios', icon: Receipt, end: false },
  { to: '/categorias', label: 'Categorías', icon: LayoutGrid, end: false },
  { to: '/proyecciones', label: 'Proyecciones', icon: TrendingUp, end: false },
  { to: '/household', label: 'Ajustes', icon: Settings, end: false },
]

// The add button goes in the middle of the bar, with three destinations
// either side of it -- which is where the eye and the thumb both expect the
// one thing you came to do.
const FAB_POSITION = 3

// The app's frame: a bottom tab bar on a phone, a left sidebar from `lg` up.
// A bar pinned to the bottom of a 27" monitor is a phone idiom on a screen
// that has never held a thumb, so above `lg` the same nav becomes a column
// down the left and the content gets the width back.
//
// Everything desktop is additive at `lg` and above -- below it not one class
// changes, so the phone this is used on every day is untouched.
export function AppShell({
  currentUserId,
  householdsDb,
}: AppShellProps): ReactElement {
  const membership = useCurrentMembership({ currentUserId, householdsDb })
  const showNav = membership !== undefined && membership !== null
  const [isAddGastoOpen, setIsAddGastoOpen] = useState(false)
  const firebase = useFirebase()
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  // The app has no server, so this is where "it pays itself every month"
  // actually happens: on open, any auto-debit bill the bank has already
  // taken money for records itself. Here rather than on one page because it
  // should run whichever screen the app opens on.
  useSettleAutoDebits({
    db,
    householdId: membership?.householdId,
    memberId: membership?.userId,
    authorDisplayName: membership?.displayName,
  })

  // Outlet always sits in the same position in the tree (Fragment > div >
  // div > Outlet) across both the nav-hidden and nav-shown branches -- only
  // the wrappers' classes and the nav sibling toggle. If showNav instead
  // changed Outlet's position (e.g. bare `<Outlet/>` vs. nested inside a
  // div), React would unmount and remount the whole routed subtree the
  // moment membership resolves and the nav pops in, discarding any
  // in-progress state (like a half-filled AddExpenseForm) in the page it
  // renders.
  return (
    <>
      {/* Padding, not margin, reserves the sidebar's column, so anything
          the inner box does happens within what is left over rather than
          within the whole viewport. */}
      <div
        className={cn(
          'w-full',
          // The bar's own height plus the part of the add button that
          // stands above it -- without that extra, the last card on a page
          // scrolled to the bottom sat underneath the circle.
          showNav &&
            'pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64',
        )}
      >
        <div
          className={cn(
            'mx-auto flex w-full flex-col items-center gap-8',
            // <main> hands the whole canvas over at lg (see App.tsx), so the
            // column width and page padding are owned here from that point
            // up. Fluid, with a 32px gutter: beside the sidebar a 1024px cap
            // was already the whole width at 1280 and only started showing
            // as empty gutters past that. The cap comes back at 2xl, where
            // a line of text really would run too long. Per direct feedback.
            showNav
              ? 'lg:px-8 lg:py-8 2xl:max-w-7xl'
              : 'lg:max-w-lg lg:px-8 lg:pt-6',
          )}
        >
          <Outlet />
        </div>
      </div>
      {showNav ? (
        <nav
          aria-label="Navegación principal"
          className={cn(
            // Dark at every width: the sidebar on a monitor and the bar on
            // a phone are the frame around the app, not another card in the
            // page. Per direct feedback.
            'bg-nav text-nav-foreground fixed z-30',
            'inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-w-lg',
            'lg:flex lg:flex-col lg:inset-y-0 lg:right-auto lg:left-0 lg:mx-0 lg:w-64 lg:max-w-none lg:rounded-none lg:px-4 lg:py-6',
          )}
        >
          {/* The wordmark lives in the header on a phone; with a sidebar
              there is a natural home for it at the top of the column, and
              AppHeader steps aside at the same breakpoint. */}
          <Logo variant="light" className="mb-8 hidden h-5 lg:block" />
          {/* On a phone only the current destination is named; the rest are
              their icon alone. Six labels stacked under six icons wanted
              458px of a 374px bar -- "Ajustes" was pushed off the screen
              entirely and could not be tapped, and "Proyecciones" was cut
              against the edge. Labels cannot simply be made smaller either:
              14px is this app's floor and tokens.test.ts enforces it.
              Dropping to the icon alone, with the active one unfurling into
              a pill beside its label, fits all six and takes the bar from
              76px to 64px. The sidebar from `lg` up is unchanged -- it has
              the room, and always names everything. */}
          <ul className="flex items-stretch justify-around lg:flex-col lg:justify-start lg:gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }, index) => (
              <Fragment key={to}>
                {index === FAB_POSITION ? (
                  /* The one add button on a phone, in the middle of the bar
                     and lifted out of it. The header carries it from `lg`,
                     where there is a sidebar and no thumb; down here the
                     bar is where the thumb already is. Per direct feedback.

                     A 2px ring in the same grey the bar's own icons are
                     draws it off the bar: both are near-black, so edge to
                     edge the circle was disappearing into the bar it sits
                     in. border-0 matters -- Button carries a 1px
                     transparent border and clips its background to the
                     padding box, so the bar showed through as a dark hair
                     between the fill and the ring. No shadow; nothing in
                     this app casts one. */
                  <li className="relative flex w-14 shrink-0 items-center justify-center lg:hidden">
                    <AddGastoSheet
                      triggerIconOnly
                      triggerClassName="bg-fab ring-nav-foreground absolute -top-6 size-14 rounded-full border-0 p-0 ring-2 transition-transform active:scale-95"
                      open={isAddGastoOpen}
                      onOpenChange={setIsAddGastoOpen}
                      db={db}
                      householdId={membership.householdId}
                      memberId={membership.userId}
                      authorDisplayName={membership.displayName}
                    />
                  </li>
                ) : null}
                <li className={cn('min-w-0', 'lg:w-full')}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-2xl px-2 text-xs font-medium transition-colors',
                        'lg:w-full lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-sm',
                        // On a dark frame the active item is a lighter well
                        // rather than a tinted one: the page's own action
                        // colour would read as a button sitting in the nav.
                        isActive
                          ? 'bg-white/12 text-nav-foreground-active'
                          : 'text-nav-foreground lg:hover:bg-white/8 lg:hover:text-nav-foreground-active',
                      )
                    }
                  >
                    <Icon className="size-5 shrink-0" aria-hidden="true" />
                    {/* Icons alone on a phone -- sr-only rather than hidden,
                        so an unlabelled icon is still a named destination to
                        a screen reader. The active one used to unfurl into
                        its label, which widened that item and shoved the
                        raised add button off centre every time you changed
                        screen. The lit pill behind the icon is what says
                        which one you are on. The sidebar from `lg` names
                        everything; it has the room. */}
                    <span className="sr-only truncate lg:not-sr-only">
                      {label}
                    </span>
                  </NavLink>
                </li>
              </Fragment>
            ))}
          </ul>
          <div className="hidden lg:contents">
            <DolarConverter />
          </div>
        </nav>
      ) : null}
    </>
  )
}

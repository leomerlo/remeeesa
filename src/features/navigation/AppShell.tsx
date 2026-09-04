import type { ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { History, Home, LayoutGrid, Receipt, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { cn } from '@/lib/utils'
import type { HouseholdsDb } from '@/lib/households'
import { useShowNav } from './useShowNav'

export type AppShellProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

type NavItem = {
  readonly to: string
  readonly label: string
  readonly icon: LucideIcon
  readonly end: boolean
  // Desktop-only entries. The phone's bar has room for four without the
  // targets getting cramped, and Servicios is already one tap from Home
  // there; on desktop it is the screen the whole layout exists for (the
  // start-of-month sit-down), so it earns a permanent place.
  readonly desktopOnly?: boolean
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/historico', label: 'Histórico', icon: History, end: false },
  { to: '/categorias', label: 'Categorías', icon: LayoutGrid, end: false },
  {
    to: '/pendientes',
    label: 'Servicios',
    icon: Receipt,
    end: false,
    desktopOnly: true,
  },
  { to: '/household', label: 'Ajustes', icon: Settings, end: false },
]

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
  const showNav = useShowNav({ currentUserId, householdsDb })

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
      {/* Padding, not margin, reserves the sidebar's column: `mx-auto` on
          the inner box then centres the content within what is left over
          rather than within the whole viewport, so the reading column sits
          centred in the space beside the sidebar at any window width. */}
      <div className={cn('w-full', showNav && 'pb-24 lg:pb-0 lg:pl-64')}>
        <div
          className={cn(
            'mx-auto flex w-full flex-col items-center gap-6',
            // <main> hands the whole canvas over at lg (see App.tsx), so the
            // column width and page padding are owned here from that point up.
            showNav
              ? 'lg:max-w-5xl lg:px-10 lg:py-8'
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
            'bg-card shadow-raised fixed z-30',
            'inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl px-2 pt-2 pb-3 sm:max-w-lg',
            'lg:inset-y-0 lg:right-auto lg:left-0 lg:mx-0 lg:w-64 lg:max-w-none lg:rounded-none lg:px-4 lg:py-6',
          )}
        >
          {/* The wordmark lives in the header on a phone; with a sidebar
              there is a natural home for it at the top of the column, and
              AppHeader steps aside at the same breakpoint. */}
          <Logo className="mb-8 hidden h-5 lg:block" />
          <ul className="flex items-stretch justify-around lg:flex-col lg:justify-start lg:gap-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end, desktopOnly }) => (
              <li key={to} className={cn(desktopOnly && 'hidden lg:block')}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors',
                      'lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-4 lg:py-3 lg:text-sm',
                      isActive
                        ? 'text-primary bg-primary-subtle'
                        : 'text-muted-foreground lg:hover:bg-muted lg:hover:text-foreground',
                    )
                  }
                >
                  <Icon className="size-5" aria-hidden="true" />
                  <span>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </>
  )
}

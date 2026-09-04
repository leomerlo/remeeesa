import type { ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { History, Home, LayoutGrid, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
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
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio', icon: Home, end: true },
  { to: '/historico', label: 'Histórico', icon: History, end: false },
  { to: '/categorias', label: 'Categorías', icon: LayoutGrid, end: false },
  { to: '/household', label: 'Ajustes', icon: Settings, end: false },
]

export function AppShell({
  currentUserId,
  householdsDb,
}: AppShellProps): ReactElement {
  const showNav = useShowNav({ currentUserId, householdsDb })

  // Outlet always sits in the same position in the tree (Fragment > div >
  // Outlet) across both the nav-hidden and nav-shown branches -- only the
  // wrapper's padding and the nav sibling toggle. If showNav instead changed
  // Outlet's position (e.g. bare `<Outlet/>` vs. nested inside a div), React
  // would unmount and remount the whole routed subtree the moment membership
  // resolves and the nav pops in, discarding any in-progress state (like a
  // half-filled AddExpenseForm) in the page it renders.
  return (
    <>
      <div className={cn('w-full', showNav && 'pb-24')}>
        <Outlet />
      </div>
      {showNav ? (
        <nav
          aria-label="Navegación principal"
          className="bg-card shadow-raised fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md rounded-t-3xl px-2 pt-2 pb-3 sm:max-w-lg"
        >
          <ul className="flex items-stretch justify-around">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors',
                      isActive
                        ? 'text-primary bg-primary/10'
                        : 'text-muted-foreground',
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

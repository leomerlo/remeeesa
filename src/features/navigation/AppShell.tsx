import { useEffect, useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { History, Home, LayoutGrid, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFirebase } from '@/lib/firebaseContext'
import { createFirestoreHouseholdsDb, getMembership } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'

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
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/historico', label: 'Histórico', icon: History, end: false },
  { to: '/categorias', label: 'Categorías', icon: LayoutGrid, end: false },
  { to: '/household', label: 'Ajustes', icon: Settings, end: false },
]

export function AppShell({
  currentUserId: currentUserIdProp,
  householdsDb,
}: AppShellProps): ReactElement {
  const firebase = useFirebase()
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    undefined,
  )
  const currentUserId =
    currentUserIdProp !== undefined ? currentUserIdProp : sessionUserId
  const db = useMemo(
    () => householdsDb ?? createFirestoreHouseholdsDb(firebase.db),
    [householdsDb, firebase.db],
  )
  const [membership, setMembership] = useState<
    HouseholdMember | null | undefined
  >(undefined)

  useEffect(() => {
    if (currentUserIdProp !== undefined) {
      return
    }
    let cancelled = false
    let authReady = false

    void firebase.auth.authStateReady().then(() => {
      if (cancelled) {
        return
      }
      authReady = true
      setSessionUserId(firebase.auth.currentUser?.uid ?? null)
    })

    const unsubscribe = firebase.auth.onAuthStateChanged((user) => {
      if (!cancelled && authReady) {
        setSessionUserId(user?.uid ?? null)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [currentUserIdProp, firebase.auth])

  useEffect(() => {
    if (typeof currentUserId !== 'string') {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const member = await getMembership({ db, userId: currentUserId })
        if (!cancelled) {
          setMembership(member)
        }
      } catch {
        if (!cancelled) {
          setMembership(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currentUserId, db])

  const showNav =
    typeof currentUserId === 'string' &&
    membership !== undefined &&
    membership !== null

  if (!showNav) {
    return <Outlet />
  }

  return (
    <>
      <div className="w-full pb-24">
        <Outlet />
      </div>
      <nav
        aria-label="Primary"
        className="bg-card shadow-raised fixed inset-x-0 bottom-0 z-30 mx-auto max-w-sm rounded-t-3xl"
      >
        <ul className="flex items-stretch justify-around">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-xs font-medium',
                    isActive
                      ? 'bg-primary text-primary-foreground'
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
    </>
  )
}

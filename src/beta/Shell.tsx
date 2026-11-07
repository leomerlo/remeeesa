import {
  CalendarClock,
  ChartPie,
  CreditCard,
  History,
  House,
  Plus,
  UserRound,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { Dolar } from './Dolar'
import type { BetaSession } from './data'
import { GastoSheet } from './sheets/GastoSheet'

// All six, in both places. On a phone they are their icon alone -- the
// v1 found the same thing: six labels under six icons wanted more width
// than a phone has, and this app's type floor means they cannot simply be
// set smaller. The label stays in the markup for a screen reader, so an
// unlabelled icon is still a named destination, and the lit pill behind
// the icon says which one you are on. The rail names everything; it has
// the room.
const TABS = [
  { to: '/', label: 'Inicio', Icon: House, end: true },
  { to: '/gastos', label: 'Gastos', Icon: History, end: false },
  { to: '/servicios', label: 'Servicios', Icon: CalendarClock, end: false },
  { to: '/tarjetas', label: 'Tarjetas', Icon: CreditCard, end: false },
  { to: '/categorias', label: 'Categorías', Icon: ChartPie, end: false },
  { to: '/perfil', label: 'Perfil', Icon: UserRound, end: false },
] as const

// The rail on a desktop, the bar on a phone, and the one action.
export function Shell({
  children,
  home,
  session,
}: {
  readonly children: ReactNode
  // The household's name for the desktop bar. Absent while it is still
  // being read, which is a placeholder rather than an empty bar -- the bar
  // must not change height once the name arrives.
  readonly home?: string
  // Absent only in the boot skeleton, which has no session yet and no
  // button to press.
  readonly session?: BetaSession
}): ReactElement {
  // Anotar un gasto lives in the shell because its button does: the bar at
  // the bottom of a phone and the bar at the top of a desktop are both
  // here, and the form they open should not have to be written twice.
  const [adding, setAdding] = useState(false)
  const householdId = session?.householdId ?? null
  const forForm = useQuery({
    queryKey: ['beta', 'nuevo-gasto', householdId],
    enabled: householdId !== null && adding,
    queryFn: async () => {
      const id = householdId as string
      const [categories, methods] = await Promise.all([
        session?.db.listCategories(id) ?? [],
        session?.db.listCards({ householdId: id }) ?? [],
      ])
      return { categories, methods }
    },
  })

  return (
    <div className="shell">
      <nav className="nav" aria-label="Navegación principal">
        <div className="nav-in">
          <div className="brand">
            {/* The v1's wordmark is a black silhouette; the v1 flips it to
                white for its own dark rail the same way. */}
            <img src={logo} alt="reméeesa" />
          </div>
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="tab">
              <span className="gl" aria-hidden="true">
                <Icon />
              </span>
              <span className="lbl">{label}</span>
            </NavLink>
          ))}
          <Dolar />
          <button
            className="add"
            type="button"
            aria-label="Anotar un gasto"
            disabled={session === undefined}
            onClick={() => setAdding(true)}
          >
            <span className="plus" aria-hidden="true">
              <Plus />
            </span>
            <span className="lbl" aria-hidden="true">
              Anotar un gasto
            </span>
          </button>
        </div>
      </nav>
      {/* Desktop only. The phone has no room for it and does not need it:
          its bar already carries the one action, and the household's name
          sits under each screen's title. On a wide screen that name wants
          a fixed place, and the action wants to be reachable without
          travelling to the far corner of the rail. */}
      <header className="topbar">
        <span className="where">
          <House aria-hidden="true" />
          {home === undefined ? <span className="ph" /> : home}
        </span>
        <button
          className="btn btn-primary"
          type="button"
          disabled={session === undefined}
          onClick={() => setAdding(true)}
        >
          <Plus />
          Anotar un gasto
        </button>
      </header>
      <main className="app">{children}</main>
      {adding && forForm.data !== undefined ? (
        <GastoSheet
          open
          onClose={() => setAdding(false)}
          expense={null}
          categories={forForm.data.categories}
          methods={forForm.data.methods}
          today={new Date()}
        />
      ) : null}
    </div>
  )
}

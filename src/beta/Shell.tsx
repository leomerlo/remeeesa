import {
  CalendarClock,
  ChartPie,
  CreditCard,
  History,
  House,
  Plus,
  UserRound,
} from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '@/assets/logo.png'
import { Dolar } from './Dolar'

// `bar` is whether the tab also appears in a phone's bottom bar. Six fit
// the desktop rail; a phone's bar holds four and the one action, so
// Categorías is reached there from the ring on Inicio, which is where
// anyone looking for it is already looking.
const TABS = [
  { to: '/', label: 'Inicio', Icon: House, end: true, bar: true },
  { to: '/gastos', label: 'Gastos', Icon: History, end: false, bar: true },
  {
    to: '/cuentas',
    label: 'Cuentas',
    Icon: CalendarClock,
    end: false,
    bar: true,
  },
  {
    to: '/tarjetas',
    label: 'Tarjetas',
    Icon: CreditCard,
    end: false,
    bar: true,
  },
  {
    to: '/categorias',
    label: 'Categorías',
    Icon: ChartPie,
    end: false,
    bar: false,
  },
  { to: '/perfil', label: 'Perfil', Icon: UserRound, end: false, bar: true },
] as const

// The rail on a desktop, the bar on a phone, and the one action.
export function Shell({
  children,
  home,
}: {
  readonly children: ReactNode
  // The household's name for the desktop bar. Absent while it is still
  // being read, which is a placeholder rather than an empty bar -- the bar
  // must not change height once the name arrives.
  readonly home?: string
}): ReactElement {
  return (
    <div className="shell">
      <nav className="nav" aria-label="Navegación principal">
        <div className="nav-in">
          <div className="brand">
            {/* The v1's wordmark is a black silhouette; the v1 flips it to
                white for its own dark rail the same way. */}
            <img src={logo} alt="reméeesa" />
          </div>
          {TABS.map(({ to, label, Icon, end, bar }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={bar ? 'tab' : 'tab rail-only'}
            >
              <span className="gl" aria-hidden="true">
                <Icon />
              </span>
              {label}
            </NavLink>
          ))}
          <Dolar />
          <button
            className="add"
            type="button"
            aria-label="Anotar un gasto"
            disabled
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
        <button className="btn btn-primary" type="button" disabled>
          <Plus />
          Anotar un gasto
        </button>
      </header>
      <main className="app">{children}</main>
    </div>
  )
}

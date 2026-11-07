import { CalendarClock, History, House, Plus, UserRound } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import logo from '@/assets/logo.png'

const TABS = [
  { to: '/', label: 'Inicio', Icon: House, end: true },
  { to: '/gastos', label: 'Gastos', Icon: History, end: false },
  { to: '/cuentas', label: 'Cuentas', Icon: CalendarClock, end: false },
  { to: '/perfil', label: 'Perfil', Icon: UserRound, end: false },
] as const

// Four tabs and the one action, which is as many as a phone's bar holds.
// Categorías lives inside Gastos for that reason -- it is a view of the
// same data, so it belongs where the data is.
export function Shell({
  children,
}: {
  readonly children: ReactNode
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
          {TABS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="tab">
              <span className="gl" aria-hidden="true">
                <Icon />
              </span>
              {label}
            </NavLink>
          ))}
          <button className="add" type="button" aria-label="Anotar un gasto">
            <span className="plus" aria-hidden="true">
              <Plus />
            </span>
            <span className="lbl" aria-hidden="true">
              Anotar un gasto
            </span>
          </button>
        </div>
      </nav>
      <main className="app">{children}</main>
    </div>
  )
}

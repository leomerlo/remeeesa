import {
  Check,
  ChevronRight,
  LineChart,
  Pencil,
  TriangleAlert,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { cssVars } from '@/lib/cssVars'
import {
  formatAmount,
  formatCompactCurrency,
  formatCurrency,
} from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'
import type { CardPurchase } from '@/lib/cards'
import { billState } from './figures'
export { billState, sortBills } from './figures'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { CategoryTile } from './Tile'
import { categoryMark, monthName } from './format'

export function Section({
  title,
  to,
  linkText,
  children,
}: {
  readonly title: string
  readonly to?: string
  readonly linkText?: string
  readonly children: React.ReactNode
}): ReactElement {
  return (
    <section className="sec">
      <h2>
        {title}
        {to !== undefined ? <a href={to}>{linkText}</a> : null}
      </h2>
      {children}
    </section>
  )
}

export function ExpenseRow({
  expense,
  categories,
  several,
  onEdit,
}: {
  readonly expense: Expense
  readonly categories: readonly Category[]
  readonly several: boolean
  // Absent where the row is only being shown -- the three on Inicio are a
  // glance, not a place to work.
  readonly onEdit?: () => void
}): ReactElement {
  const mark = categoryMark(categories, expense.categoryId)
  return (
    <div className="card row">
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{expense.name}</span>
      <span className="amt">
        {formatAmount(expense.price, expense.currency)}
      </span>
      {onEdit === undefined ? null : (
        <button
          className="rowedit"
          type="button"
          aria-label={`Editar ${expense.name}`}
          onClick={onEdit}
        >
          <Pencil />
        </button>
      )}
      <span className="meta">
        <span className="cat">{mark.name}</span>
        <span className="badges">
          <span className="tag ok">Pagado</span>
          {several ? (
            <span className="who">{expense.authorDisplayName}</span>
          ) : null}
        </span>
      </span>
    </div>
  )
}

// A purchase on a credit card is not an Expense -- it becomes one only when
// the card's Resumen is paid -- so it gets its own row, marked as such.
export function PurchaseRow({
  purchase,
  categories,
  several,
}: {
  readonly purchase: CardPurchase
  readonly categories: readonly Category[]
  readonly several: boolean
}): ReactElement {
  const mark = categoryMark(categories, purchase.categoryId)
  return (
    <div className="card row">
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{purchase.name}</span>
      <span className="amt">
        {formatAmount(purchase.total, purchase.currency)}
      </span>
      <span className="meta">
        <span className="cat">{mark.name}</span>
        <span className="badges">
          <span className="tag credit">Con la tarjeta</span>
          {several ? (
            <span className="who">{purchase.authorDisplayName}</span>
          ) : null}
        </span>
      </span>
    </div>
  )
}

export function BillRow({
  bill,
  categories,
  monthStart,
  now,
  onEdit,
  onPay,
}: {
  readonly bill: Pendiente
  readonly categories: readonly Category[]
  readonly monthStart: Date
  readonly now: Date
  readonly onEdit?: () => void
  readonly onPay?: () => void
}): ReactElement {
  const mark = categoryMark(categories, bill.categoryId)
  const state = billState(bill, monthStart, now)
  const day = bill.dueDate.getDate()
  const currency = bill.currency ?? DEFAULT_CURRENCY

  return (
    <div className={state === 'open' ? 'card row' : `card row ${state}`}>
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{bill.name}</span>
      <span className="amt">
        {bill.expectedAmount === null
          ? 'A confirmar'
          : formatAmount(bill.expectedAmount, currency)}
      </span>
      <span className="meta">
        <span className="cat">
          {state === 'late'
            ? `Vencía el ${String(day)} de ${monthName(bill.dueDate).slice(0, 3)}.`
            : state === 'due'
              ? `Vencía el ${String(day)}`
              : mark.name}
        </span>
        <span className="badges">
          {state === 'paid' ? (
            <span className="tag paid">
              <Check />
              {bill.paidPurchaseId != null
                ? 'Pagado con tarjeta'
                : bill.paidAt === null
                  ? 'Pagado'
                  : `Pagado el ${String(bill.paidAt.getDate())}`}
            </span>
          ) : state === 'late' ? (
            <span className="tag late">
              <TriangleAlert />
              Quedó sin pagar en {monthName(bill.dueDate)}
            </span>
          ) : state === 'due' ? (
            <span className="tag due">
              <TriangleAlert />
              Ya venció este mes
            </span>
          ) : (
            <span className="tag next">Vence el {day}</span>
          )}
          {currency !== DEFAULT_CURRENCY ? (
            <span className="tag usd">En dólares</span>
          ) : null}
          {bill.recurring ? (
            <span className="tag soft">Todos los meses</span>
          ) : null}
          {bill.autoDebit ? (
            <span className="tag soft">Débito automático</span>
          ) : null}
        </span>
      </span>
      {onEdit === undefined ? null : (
        <button
          className="rowedit"
          type="button"
          aria-label={`Editar ${bill.name}`}
          onClick={onEdit}
        >
          <Pencil />
        </button>
      )}
      {state === 'paid' || onPay === undefined ? null : (
        <span className="rowfoot">
          <button className="btn btn-secondary" type="button" onClick={onPay}>
            <Check />
            Marcar como pagado
          </button>
        </span>
      )}
    </div>
  )
}

export function AlertCard({
  kind,
  icon,
  children,
}: {
  readonly kind: 'warn' | 'danger' | 'info' | 'ok'
  readonly icon: ReactElement
  readonly children: React.ReactNode
}): ReactElement {
  return (
    <div className={`card alert alert-${kind}`}>
      <span className="tile" aria-hidden="true">
        {icon}
      </span>
      <p>{children}</p>
    </div>
  )
}

export function ProjectionLink({
  monthStart,
}: {
  readonly monthStart: Date
}): ReactElement {
  return (
    <Link className="card quiet" to="/proyeccion">
      <span className="tile" aria-hidden="true">
        <LineChart />
      </span>
      <span className="k">Cómo viene {monthName(monthStart)}</span>
      <span className="v">
        Lo cargado del mes más lo que el mes pasado dice que falta
      </span>
      <span className="go" aria-hidden="true">
        <ChevronRight />
      </span>
    </Link>
  )
}

export function Donut({
  rows,
}: {
  readonly rows: readonly {
    readonly categoryId: string
    readonly name: string
    readonly color: string
    readonly total: number
    readonly share: number
  }[]
}): ReactElement | null {
  // A category with nothing in it is not a slice and not a line: it was
  // listed at 0% of a total it took nothing out of.
  const spent = rows.filter((row) => row.total > 0)
  if (spent.length === 0) return null
  const total = spent.reduce((sum, row) => sum + row.total, 0)
  const circumference = 2 * Math.PI * 52
  const arcs = spent.map((row, index) => ({
    row,
    length: row.share * circumference,
    offset: spent
      .slice(0, index)
      .reduce((sum, earlier) => sum + earlier.share * circumference, 0),
  }))

  return (
    <div className="card donut">
      <div className="lead">Distribuidos por categoría</div>
      <div className="donut-top">
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label="Reparto por categoría"
        >
          <g transform="rotate(-90 70 70)">
            {arcs.map(({ row, length, offset }) => (
              <circle
                key={row.categoryId}
                cx="70"
                cy="70"
                r="52"
                fill="none"
                stroke={row.color}
                strokeWidth="19"
                strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
                strokeDashoffset={(-offset).toFixed(2)}
              />
            ))}
          </g>
          <text className="hole" x="70" y="68" textAnchor="middle">
            {formatCompactCurrency(total)}
          </text>
          <text className="holesub" x="70" y="84" textAnchor="middle">
            EN TOTAL
          </text>
        </svg>
      </div>
      {/* Half the rows per column, told to the CSS so the two-column
          desktop layout can fill the first column top to bottom before
          starting the second -- the list is sorted biggest first, and
          filling it by rows turned that order into a zigzag. */}
      <div
        className="dlist"
        style={cssVars({ '--rows': String(Math.ceil(spent.length / 2)) })}
      >
        {spent.map((row, index) => {
          const percent = Math.round(row.share * 100)
          return (
            <div
              className={
                index === Math.ceil(spent.length / 2)
                  ? 'dline col-top'
                  : 'dline'
              }
              key={row.categoryId}
            >
              <i style={{ background: row.color }} />
              <span className="nm">{row.name}</span>
              <span className="amt">{formatCurrency(row.total)}</span>
              {/* The share after the figure it is a share of, as a pill in
                  the slice's own colour washed down to a tint so the
                  number on it stays near-black. Grey text floating between
                  the name and the amount read as neither. */}
              <span className="pc" style={cssVars({ '--pc': row.color })}>
                {percent === 0 ? '<1%' : `${String(percent)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

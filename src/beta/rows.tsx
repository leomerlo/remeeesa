import { Check, ChevronRight, LineChart, TriangleAlert } from 'lucide-react'
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
  // Written by the beta itself, which is the only kind of row it can edit
  // or delete. Marked so the difference is visible before you open it.
  // Absent where the row is only being shown -- the three on Inicio are a
  // glance, not a place to work.
  readonly onEdit?: () => void
}): ReactElement {
  const mark = categoryMark(categories, expense.categoryId)
  // The whole card opens the form. A button in a footer cost a row of
  // height on every gasto of the month, which on a phone is a very long
  // scroll to buy a thing two people already know how to do.
  const Row = onEdit === undefined ? 'div' : 'button'
  return (
    <Row
      className={onEdit === undefined ? 'card row' : 'card row tap'}
      {...(onEdit === undefined
        ? {}
        : {
            type: 'button' as const,
            onClick: onEdit,
            'aria-label': `Editar ${expense.name}`,
          })}
    >
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{expense.name}</span>
      <span className="amt">
        {formatAmount(expense.price, expense.currency)}
      </span>
      <span className="meta">
        <span className="cat">
          {expense.expenseDate.getDate()} de {monthName(expense.expenseDate)}
        </span>
        {/* No "Pagado" badge: a gasto is money that already left, which
            is the whole difference between it and a bill. Who loaded it
            goes last, after the category, on every row that has one. */}
        <span className="badges">
          <span className="tag cat-tag" style={cssVars({ '--pc': mark.color })}>
            {mark.name}
          </span>
          {several ? (
            <span className="who">{expense.authorDisplayName}</span>
          ) : null}
        </span>
      </span>
    </Row>
  )
}

// A purchase on a credit card is not an Expense -- it becomes one only when
// the card's Resumen is paid -- so it gets its own row, marked as such.
export function PurchaseRow({
  purchase,
  categories,
  several,
  onEdit,
}: {
  readonly purchase: CardPurchase
  readonly categories: readonly Category[]
  readonly several: boolean
  readonly onEdit?: () => void
}): ReactElement {
  const mark = categoryMark(categories, purchase.categoryId)
  const Row = onEdit === undefined ? 'div' : 'button'
  return (
    <Row
      className={onEdit === undefined ? 'card row' : 'card row tap'}
      {...(onEdit === undefined
        ? {}
        : {
            type: 'button' as const,
            onClick: onEdit,
            'aria-label': `Editar ${purchase.name}`,
          })}
    >
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{purchase.name}</span>
      <span className="amt">
        {formatAmount(purchase.total, purchase.currency)}
      </span>
      <span className="meta">
        <span className="cat">
          {purchase.purchaseDate.getDate()} de{' '}
          {monthName(purchase.purchaseDate)}
        </span>
        <span className="badges">
          <span className="tag credit">Con la tarjeta</span>
          <span className="tag cat-tag" style={cssVars({ '--pc': mark.color })}>
            {mark.name}
          </span>
          {several ? (
            <span className="who">{purchase.authorDisplayName}</span>
          ) : null}
        </span>
      </span>
    </Row>
  )
}

export function BillRow({
  bill,
  categories,
  monthStart,
  now,
  several = false,
  paidBy = null,
  onEdit,
  onPay,
}: {
  readonly bill: Pendiente
  readonly categories: readonly Category[]
  readonly monthStart: Date
  readonly now: Date
  // More than one person in the house. Alone, naming who did something is
  // noise on every row.
  readonly several?: boolean
  // Who paid it, where it is paid and the payment left a gasto with a
  // name on it. Nobody has paid an open bill, so it carries none.
  readonly paidBy?: string | null
  readonly onEdit?: () => void
  readonly onPay?: () => void
}): ReactElement {
  const mark = categoryMark(categories, bill.categoryId)
  const state = billState(bill, monthStart, now)
  const day = bill.dueDate.getDate()
  const currency = bill.currency ?? DEFAULT_CURRENCY

  // The card carries the footer, so the part that opens the form is the
  // part above it -- everything down to the badges. Editar had a button
  // of its own down there and was costing a row of height on every bill.
  const Top = onEdit === undefined ? 'div' : 'button'
  return (
    <div
      className={state === 'open' ? 'card rowcard' : `card rowcard ${state}`}
    >
      <Top
        className={onEdit === undefined ? 'row' : 'row tap'}
        {...(onEdit === undefined
          ? {}
          : {
              type: 'button' as const,
              onClick: onEdit,
              'aria-label': `Editar ${bill.name}`,
            })}
      >
        <CategoryTile name={mark.name} color={mark.color} />
        <span className="name">{bill.name}</span>
        <span className="amt">
          {bill.expectedAmount === null
            ? 'A confirmar'
            : formatAmount(bill.expectedAmount, currency)}
        </span>
        {/* One order, on every bill, whatever state it is in: the name, the
          date it is due, and then the badges. The grey line used to be
          the date on a bill in trouble and the category on a quiet one,
          with the date repeated as a badge beside it -- so no two cards
          read the same way and the same fact appeared twice. The date is
          always the grey line; the category is always a badge, in its own
          colour, last. */}
        <span className="meta">
          <span className="cat">
            {bill.dueDate < now ? 'Vencía' : 'Vence'} el {day} de{' '}
            {monthName(bill.dueDate)}
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
            ) : null}
            {currency !== DEFAULT_CURRENCY ? (
              <span className="tag usd">En dólares</span>
            ) : null}
            {/* No "Todos los meses": that is what a servicio is. What is
              worth saying is the exception -- a bill that happens once. */}
            {bill.recurring ? null : (
              <span className="tag soft">Una sola vez</span>
            )}
            {bill.autoDebit ? (
              <span className="tag soft">Débito automático</span>
            ) : null}
            <span
              className="tag cat-tag"
              style={cssVars({ '--pc': mark.color })}
            >
              {mark.name}
            </span>
            {several && paidBy != null && paidBy !== '' ? (
              <span className="who">{paidBy}</span>
            ) : null}
          </span>
        </span>
      </Top>
      {/* The footer is left with the one thing a tap cannot be: paying a
          bill changes the month, so it has to be asked for on purpose. */}
      {state === 'paid' || onPay === undefined ? null : (
        <span className="rowfoot">
          <button className="btn btn-secondary" type="button" onClick={onPay}>
            <Check />
            Ya lo pagué
          </button>
        </span>
      )}
    </div>
  )
}

// A row this browser's beta wrote itself. It is the only kind it can change
// or delete, so saying which ones they are is half the explanation of why
// the pencil on the others does nothing.
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

// The month ahead, never the one on screen: this is the only thing in the
// app about a month that can still be changed.
export function ProjectionLink({
  monthStart,
}: {
  readonly monthStart: Date
}): ReactElement {
  const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  return (
    <Link className="card quiet" to="/proyeccion">
      <span className="tile" aria-hidden="true">
        <LineChart />
      </span>
      <span className="k">
        Proyectar {monthName(next).charAt(0).toUpperCase()}
        {monthName(next).slice(1)}
      </span>
      <span className="v">
        Lo que va a costar, según lo que vienen gastando y los servicios que ya
        tienen
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

import { Check, ChevronRight, TriangleAlert } from 'lucide-react'
import type { ReactElement } from 'react'
import { formatAmount, formatCurrency } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'
import type { CardPurchase } from '@/lib/cards'
import { DEFAULT_CURRENCY } from '@/lib/money'
import { CategoryTile } from './Tile'
import { categoryMark, monthName } from './format'

export type BillState = 'late' | 'due' | 'open'

// Three states read off the bill's own due date: carried over from a month
// that has closed, past its day in this one, or still ahead.
export function billState(
  bill: Pendiente,
  monthStart: Date,
  now: Date,
): BillState {
  if (bill.dueDate < monthStart) return 'late'
  return bill.dueDate < now ? 'due' : 'open'
}

const RANK: Record<BillState, number> = { late: 0, due: 1, open: 2 }

export function sortBills(
  bills: readonly Pendiente[],
  monthStart: Date,
  now: Date,
): readonly Pendiente[] {
  return [...bills].sort(
    (a, b) =>
      RANK[billState(a, monthStart, now)] -
        RANK[billState(b, monthStart, now)] ||
      a.dueDate.getTime() - b.dueDate.getTime(),
  )
}

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
}: {
  readonly expense: Expense
  readonly categories: readonly Category[]
  readonly several: boolean
}): ReactElement {
  const mark = categoryMark(categories, expense.categoryId)
  return (
    <div className="card row">
      <CategoryTile name={mark.name} color={mark.color} />
      <span className="name">{expense.name}</span>
      <span className="amt">
        {formatAmount(expense.price, expense.currency)}
      </span>
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
}: {
  readonly bill: Pendiente
  readonly categories: readonly Category[]
  readonly monthStart: Date
  readonly now: Date
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
          {state === 'late' ? (
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
      <span className="rowfoot">
        <button className="btn btn-secondary" type="button" disabled>
          <Check />
          Marcar como pagada
        </button>
      </span>
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
  const next = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
  return (
    <button className="card quiet" type="button" disabled>
      <span className="tile" aria-hidden="true">
        <ChevronRight />
      </span>
      <span className="k">Proyectar {monthName(next)}</span>
      <span className="v">
        Cuánto van a gastar el mes que viene, más o menos
      </span>
      <span className="go" aria-hidden="true">
        <ChevronRight />
      </span>
    </button>
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
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const circumference = 2 * Math.PI * 52
  const arcs = rows.map((row, index) => ({
    row,
    length: row.share * circumference,
    offset: rows
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
            {formatCurrency(total)}
          </text>
          <text className="holesub" x="70" y="84" textAnchor="middle">
            EN TOTAL
          </text>
        </svg>
      </div>
      <div className="dlist">
        {rows.map((row) => (
          <div className="dline" key={row.categoryId}>
            <i style={{ background: row.color }} />
            <span className="nm">{row.name}</span>
            <span className="pc">{Math.round(row.share * 100)}%</span>
            <span className="amt">{formatCurrency(row.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

import {
  Check,
  ChevronRight,
  Info,
  LineChart,
  TriangleAlert,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { cssVars } from '@/lib/cssVars'
import type { Category, Expense } from '@/lib/expenses'
import { amountLeft, isPartlyPaid, paidSoFar } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import type { CardPurchase } from '@/lib/cards'
import { billState } from './figures'
export { billState, sortBills } from './figures'
import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import { CategoryTile } from './Tile'
import {
  categoryMark,
  formatAmount,
  formatCompactCurrency,
  formatCurrency,
  monthName,
} from './format'

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
  paidWith = null,
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
  // And with what. It belongs to the payment, not to the bill: the same
  // servicio can be cash one month and a card the next.
  readonly paidWith?: string | null
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
        {/* On an open bill, what is left to pay -- which on all but a
          part-paid one is the whole figure it asks for. It is the figure
          somebody is about to hand over, so it is the one in big type;
          what the bill asked for and what has gone in already are said
          together on a badge below.

          On a settled bill it is what the bill was worth: "lo que falta"
          of something already paid is nothing, and a paid row reading $0
          is the one thing this number must never say. */}
        <span className="amt">
          {bill.expectedAmount === null
            ? 'A confirmar'
            : formatAmount(
                state === 'paid'
                  ? bill.expectedAmount
                  : (amountLeft(bill) ?? 0),
                currency,
              )}
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
                {bill.paidAt === null
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
            {/* What it was paid with, which only a paid bill has. Named
                where the name is known, and "con tarjeta" where the card
                behind the payment could not be read. */}
            {state !== 'paid' ? null : paidWith != null ? (
              <span className="tag soft">Con {paidWith}</span>
            ) : bill.paidPurchaseId != null ? (
              <span className="tag soft">Con tarjeta</span>
            ) : null}
            {/* Part of it is already in: the badge says how much of how
                much, because the big figure above now only says what is
                left and on its own would read like a cheaper bill. */}
            {isPartlyPaid(bill) && bill.expectedAmount !== null ? (
              <span className="tag part">
                Ya van {formatAmount(paidSoFar(bill), currency)} de{' '}
                {formatAmount(bill.expectedAmount, currency)}
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
            {isPartlyPaid(bill) ? 'Pagar lo que falta' : 'Ya lo pagué'}
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
  cardBills,
  onPick,
}: {
  readonly rows: readonly {
    readonly categoryId: string
    readonly name: string
    readonly color: string
    readonly total: number
    // What the category took in dollars, kept apart rather than
    // converted: there is no rate this app is willing to pick. A
    // category spent entirely in dollars was invisible here, which is
    // how a month of subscriptions went missing.
    readonly totalUsd: number
    readonly share: number
  }[]
  // What the cards ask for this month. Said under the ring instead of
  // drawn in it -- paying the card is not something the month spent money
  // on, and last month's café is inside that figure. See cardBillTotals.
  readonly cardBills: readonly {
    readonly currency: Currency
    readonly total: number
  }[]
  // Opens that category's month: the movements behind the figure, so it
  // can be checked rather than believed.
  readonly onPick: (categoryId: string) => void
}): ReactElement | null {
  // A category with nothing in it is not a slice and not a line: it was
  // listed at 0% of a total it took nothing out of. One with only
  // dollars in it is a line without a slice -- the ring divides up the
  // pesos, and leaving the category out altogether said the month had
  // not spent there at all.
  const spent = rows.filter((row) => row.total > 0 || row.totalUsd > 0)
  if (spent.length === 0) return null
  // In cents: this is the figure in the hole, and it has to be what the
  // lines under it come to.
  const total =
    spent.reduce((cents, row) => cents + Math.round(row.total * 100), 0) / 100
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
      <div className="lead">En qué está gastando el hogar</div>
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
            <button
              type="button"
              className={
                index === Math.ceil(spent.length / 2)
                  ? 'dline col-top'
                  : 'dline'
              }
              key={row.categoryId}
              aria-label={`Ver los movimientos de ${row.name}`}
              onClick={() => onPick(row.categoryId)}
            >
              <i style={{ background: row.color }} />
              <span className="nm">{row.name}</span>
              <span className="amt">
                {row.total > 0 ? formatCurrency(row.total) : null}
                {row.totalUsd > 0 ? (
                  <span className="usd">
                    {formatAmount(row.totalUsd, 'USD')}
                  </span>
                ) : null}
              </span>
              {/* The share after the figure it is a share of, as a pill in
                  the slice's own colour washed down to a tint so the
                  number on it stays near-black. Grey text floating between
                  the name and the amount read as neither. */}
              {/* No share for a category with only dollars in it: the
                  ring divides up the pesos, and it has none. */}
              {row.total === 0 ? (
                <span className="pc pc-none">—</span>
              ) : (
                <span className="pc" style={cssVars({ '--pc': row.color })}>
                  {percent === 0 ? '<1%' : `${String(percent)}%`}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {/* The card, after the chart and not inside it. It is the one
          figure of the month that is not a thing the household spent
          money on: it is last month's spending arriving, and last
          month's spending already had its slices. Said here so it is not
          lost -- it is the biggest cheque of the month -- and said in
          both currencies, which a peso ring could never do. */}
      {cardBills.length === 0 ? null : (
        <AlertCard kind="info" icon={<Info />}>
          Además, este mes hay que pagar{' '}
          {cardBills.map(({ currency, total }, index) => (
            <span key={currency}>
              {index === 0 ? null : ' y '}
              <b>{formatAmount(total, currency)}</b>
            </span>
          ))}{' '}
          de tarjeta.
        </AlertCard>
      )}
      {/* What the chart counts, at the foot and in grey: it is the small
          print of the drawing above it, not an announcement. The card bill
          is explained here rather than up in the alert, which says the
          figure and stops. */}
      <p className="donutsay">
        Este gráfico incluye lo que ya pagaron, lo que les falta pagar y lo que
        compraron con tarjeta.
        {cardBills.length === 0
          ? null
          : ' Lo del resumen no entra: son los consumos del mes pasado, que ya se contaron cuando los hicieron.'}
      </p>
    </div>
  )
}

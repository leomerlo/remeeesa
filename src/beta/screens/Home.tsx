import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronRight,
  CreditCard,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { ReactElement } from 'react'
import {
  computePendingCommitted,
  computeSpendToDate,
  computeSpentThisMonth,
  currentMonthRange,
  formatAmount,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import { monthlyBudgetFor } from '@/lib/households'
import { isBillToPay } from '@/lib/pendientes'
import { Link } from 'react-router-dom'
import { CategoryTile } from '../Tile'
import { categoryMark } from '../format'
import type { BetaSession } from '../data'

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function Home({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const householdId = session.householdId ?? null
  const now = new Date()
  const { monthStart, monthEnd } = currentMonthRange(now)

  const data = useQuery({
    queryKey: ['beta', 'home', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [household, expenses, pendientes, allExpenses, purchases] =
        await Promise.all([
          session.db.getHousehold(id),
          session.db.listExpensesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listPendientes({ householdId: id }),
          session.db.listAllExpenses({ householdId: id }),
          session.db.listCardPurchasesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
        ])
      const categories = await session.db.listCategories(id)
      return {
        household,
        expenses,
        pendientes,
        allExpenses,
        purchases,
        categories,
      }
    },
  })

  if (data.isPending) {
    return <div className="card" aria-busy="true" style={{ minHeight: 160 }} />
  }
  if (data.isError || data.data === undefined) {
    return (
      <div className="card alert alert-danger">
        <span className="tile" aria-hidden="true" />
        <p>No pudimos leer los datos del hogar. Probá recargar la página.</p>
      </div>
    )
  }

  const {
    household,
    expenses,
    pendientes,
    allExpenses,
    purchases,
    categories,
  } = data.data
  const spent = computeSpentThisMonth(expenses)
  // Every pending bill, which is what the v1's budget subtracts too: a bill
  // still owed counts against what is left the same as a paid one.
  const bills = [...pendientes.filter(isBillToPay)].sort(
    (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
  )
  const owed = computePendingCommitted(bills)
  const budget = monthlyBudgetFor(household, monthStart, now)
  // Buying with credit does not make an Expense -- it books a CardPurchase,
  // and the Expense only appears when that card's Resumen is paid. So this
  // month's card spending is its purchases, and every Expense of the month
  // is money that has already gone.
  // A purchase calls its figure `total`, and it is the whole purchase --
  // the cuotas of it land in later Resúmenes.
  const onCard = computeSpentThisMonth(
    purchases.map((purchase) => ({
      price: purchase.total,
      currency: purchase.currency,
    })),
  )
  const toDate = computeSpendToDate(allExpenses, now)
  const monthName = MONTHS[monthStart.getMonth()] ?? ''

  return (
    <>
      <header className="head">
        <div className="hello">
          Hola, {session.displayName ?? 'vos'} 👋
          <span>
            Estos son los gastos de {household.name}, del mes de {monthName}.
          </span>
        </div>
      </header>

      <div className="band">
        {budget > 0 ? (
          <BudgetHero
            budget={budget}
            spent={spent}
            owed={owed}
            now={now}
            monthEnd={monthEnd}
          />
        ) : (
          <PlainHero spent={spent} toDate={toDate} monthName={monthName} />
        )}

        {/* "Pagado" used to sit here and repeated the figure above it to
            the peso. With the domain right, every Expense of the month is
            money already gone -- so what is worth a card of its own is the
            two kinds that have not gone yet. */}
        <div className="split">
          <div className="card wait">
            <span className="cap">
              <span
                className="dot"
                style={{ background: 'var(--amber-bar)' }}
              />
              Pendiente
            </span>
            <span className="amt">{formatCurrency(owed)}</span>
            <span className="foot">
              Cuentas que vencen y todavía no pagaron.
            </span>
          </div>
          <button className="card cardtot" type="button">
            <span className="cap">
              <span className="dot" style={{ background: 'var(--red)' }} />
              Con la tarjeta
            </span>
            <span className="amt">{formatCurrency(onCard)}</span>
            <span className="foot">
              No sale este mes: llega en el resumen que viene.
            </span>
            <span className="go" aria-hidden="true">
              <ChevronRight />
            </span>
          </button>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="sec">
            <h2>
              Últimos movimientos <Link to="/gastos">Ver todos</Link>
            </h2>
            {expenses.slice(0, 4).map((expense) => {
              const mark = categoryMark(categories, expense.categoryId)
              return (
                <div className="card row" key={expense.id}>
                  <CategoryTile name={mark.name} color={mark.color} />
                  <span className="name">{expense.name}</span>
                  <span className="amt">
                    {formatAmount(expense.price, expense.currency)}
                  </span>
                  <span className="meta">
                    <span className="cat">{mark.name}</span>
                    <span className="badges">
                      <span className="tag ok">Pagado</span>
                      <span className="who">{expense.authorDisplayName}</span>
                    </span>
                  </span>
                </div>
              )
            })}
          </section>
        </div>
        <div className="col">
          <section className="sec">
            <h2>
              Cuentas por pagar <Link to="/cuentas">Ver todas</Link>
            </h2>
            {bills.slice(0, 3).map((bill) => {
              const mark = categoryMark(categories, bill.categoryId)
              return (
                <div className="card row" key={bill.id}>
                  <CategoryTile name={mark.name} color={mark.color} />
                  <span className="name">{bill.name}</span>
                  <span className="amt">
                    {bill.expectedAmount === null
                      ? 'A confirmar'
                      : formatCurrency(bill.expectedAmount)}
                  </span>
                  <span className="meta">
                    <span className="cat">
                      Vence el {bill.dueDate.getDate()}
                    </span>
                  </span>
                </div>
              )
            })}
          </section>
        </div>
      </div>

      <Breakdown expenses={expenses} categories={categories} />
    </>
  )
}

// Every category listed under the ring, not a top five: with a dozen of
// them "otras ocho" becomes the biggest slice and says nothing.
function Breakdown({
  expenses,
  categories,
}: {
  readonly expenses: readonly import('@/lib/expenses').Expense[]
  readonly categories: readonly import('@/lib/expenses').Category[]
}): ReactElement | null {
  const rows = summarizeByCategory({ expenses, categories })
  if (rows.length === 0) {
    return null
  }
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

function PlainHero({
  spent,
  toDate,
  monthName,
}: {
  readonly spent: number
  readonly toDate: ReturnType<typeof computeSpendToDate>
  readonly monthName: string
}): ReactElement {
  const up = toDate.difference >= 0
  return (
    <div className="card hero hero-split">
      <div className="h-main">
        <div className="label">El hogar lleva gastado este mes</div>
        <div className="figure">{formatCurrency(spent)}</div>
        {toDate.lastMonth > 0 ? (
          <span className={up ? 'chip' : 'chip good'}>
            {up ? <TrendingUp /> : <TrendingDown />}
            {formatCurrency(Math.abs(toDate.difference))} {up ? 'más' : 'menos'}{' '}
            que el mes pasado
          </span>
        ) : (
          <span className="chip neutral">
            Sin un mes anterior para comparar
          </span>
        )}
      </div>
      <div className="h-side">
        <button className="btn btn-secondary" type="button">
          <Target />
          Poner un presupuesto
        </button>
      </div>
      <span hidden>{monthName}</span>
    </div>
  )
}

function BudgetHero({
  budget,
  spent,
  owed,
  now,
  monthEnd,
}: {
  readonly budget: number
  readonly spent: number
  readonly owed: number
  readonly now: Date
  readonly monthEnd: Date
}): ReactElement {
  const left = budget - spent - owed
  const over = left < 0
  const daysLeft = Math.max(
    0,
    Math.ceil((monthEnd.getTime() - now.getTime()) / 86_400_000),
  )
  const pctSpent = Math.min(100, Math.round((spent / budget) * 100))
  const pctOwed = Math.min(100 - pctSpent, Math.round((owed / budget) * 100))
  const perDay = left > 0 && daysLeft > 0 ? Math.floor(left / daysLeft) : 0

  return (
    <div className="card hero">
      <div className="label">
        {over
          ? 'El hogar se pasó del presupuesto'
          : 'Le queda al hogar este mes'}
      </div>
      <div
        className="figure"
        style={over ? { color: 'var(--red-700)' } : undefined}
      >
        {formatCurrency(left)}
      </div>
      <div className="track">
        <div
          className={over ? 'fill over' : 'fill'}
          style={{ width: `${String(pctSpent)}%` }}
        />
        {pctOwed > 0 ? (
          <div className="fill owed" style={{ width: `${String(pctOwed)}%` }} />
        ) : null}
      </div>
      <div className="legend">
        <span>
          <i style={{ background: 'var(--grape-600)' }} />
          Gastado <b>{formatCurrency(spent)}</b>
        </span>
        {owed > 0 ? (
          <span>
            <i style={{ background: 'var(--amber-bar)' }} />
            Por pagar <b>{formatCurrency(owed)}</b>
          </span>
        ) : null}
        <span>
          Presupuesto <b>{formatCurrency(budget)}</b>
        </span>
      </div>
      <div className="perday">
        <span className="ic" aria-hidden="true">
          {over ? <CreditCard /> : <CalendarDays />}
        </span>
        <span>
          {over
            ? `Quedan ${String(daysLeft)} días y ya se pasaron por ${formatCurrency(-left)}.`
            : `Quedan ${String(daysLeft)} días. Pueden gastar ${formatCurrency(perDay)} por día.`}
        </span>
      </div>
    </div>
  )
}

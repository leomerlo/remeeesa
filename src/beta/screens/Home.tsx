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
  formatCurrency,
} from '@/lib/expenses'
import { monthlyBudgetFor } from '@/lib/households'
import { isBillToPay } from '@/lib/pendientes'
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
      return { household, expenses, pendientes, allExpenses, purchases }
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

  const { household, expenses, pendientes, allExpenses, purchases } = data.data
  const spent = computeSpentThisMonth(expenses)
  // Every pending bill, which is what the v1's budget subtracts too: a bill
  // still owed counts against what is left the same as a paid one.
  const owed = computePendingCommitted(pendientes.filter(isBillToPay))
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
  const paid = spent
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

        <div className="trio">
          <div className="card out">
            <span className="cap">
              <span
                className="dot"
                style={{ background: 'var(--green-700)' }}
              />
              Pagado
            </span>
            <span className="amt">{formatCurrency(paid)}</span>
            <span className="foot">Ya salió de la cuenta.</span>
          </div>
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
    </>
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

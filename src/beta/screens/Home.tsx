import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  ChevronRight,
  Lightbulb,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import {
  computePendingCommitted,
  computeSpendToDate,
  computeSpentThisMonth,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import { monthlyBudgetFor } from '@/lib/households'
import { isBillToPay } from '@/lib/pendientes'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import {
  AlertCard,
  BillRow,
  Donut,
  ExpenseRow,
  ProjectionLink,
  PurchaseRow,
  billState,
  sortBills,
} from '../rows'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { LoadFailed } from './Gastos'

export function Home({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const householdId = session.householdId ?? null
  const now = new Date()
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'home', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [
        household,
        expenses,
        pendientes,
        allExpenses,
        purchases,
        categories,
        members,
      ] = await Promise.all([
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
        session.db.listCategories(id),
        session.db.listMembers(id),
      ])
      return {
        household,
        expenses,
        pendientes,
        allExpenses,
        purchases,
        categories,
        members,
      }
    },
  })

  if (data.isPending) {
    return <div className="card" aria-busy="true" style={{ minHeight: 160 }} />
  }
  if (data.isError || data.data === undefined) {
    return <LoadFailed />
  }

  const {
    household,
    expenses,
    pendientes,
    allExpenses,
    purchases,
    categories,
    members,
  } = data.data

  // What the household spent this month is both kinds together: the money
  // already gone, and what went onto a card and leaves with its Resumen.
  const paid = computeSpentThisMonth(expenses)
  const onCard = computeSpentThisMonth(
    purchases.map((purchase) => ({
      price: purchase.total,
      currency: purchase.currency,
    })),
  )
  const spent = paid + onCard

  const bills = sortBills(pendientes.filter(isBillToPay), monthStart, now)
  const owed = computePendingCommitted(bills)
  const late = bills.filter(
    (bill) => billState(bill, monthStart, now) === 'late',
  )
  const budget = monthlyBudgetFor(household, monthStart, now)
  const toDate = computeSpendToDate(allExpenses, now)
  const byCategory = summarizeByCategory({ expenses, categories })
  const top = byCategory[0]
  const several = members.length > 1
  const others = members
    .map((member) => member.displayName)
    .filter((name) => name !== session.displayName)

  return (
    <>
      <header className="head">
        <div className="hello">
          Hola, {session.displayName ?? 'vos'} 👋
          <span>
            Estos son los gastos de {household.name}, tuyos
            {others.length > 0 ? ` y de ${others.join(' y ')}` : ''}, del mes de{' '}
            {monthName(monthStart)}.
          </span>
        </div>
        <MonthPager />
      </header>

      <div className="band">
        {budget > 0 ? (
          <BudgetHero
            budget={budget}
            spent={paid}
            owed={owed}
            now={now}
            monthEnd={monthEnd}
          />
        ) : (
          <PlainHero spent={spent} toDate={toDate} />
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
          <Link className="card cardtot" to="/cuentas">
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
          </Link>
        </div>
      </div>

      <div className="cols">
        <div className="col">
          <section className="sec">
            <h2>
              Últimos movimientos <Link to="/gastos">Ver todos</Link>
            </h2>
            {expenses.slice(0, 3).map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                categories={categories}
                several={several}
              />
            ))}
            {purchases.slice(0, 1).map((purchase) => (
              <PurchaseRow
                key={purchase.id}
                purchase={purchase}
                categories={categories}
                several={several}
              />
            ))}
          </section>
        </div>
        <div className="col">
          {bills.length > 0 ? (
            <section className="sec">
              <h2>
                Cuentas por pagar <Link to="/cuentas">Ver todas</Link>
              </h2>
              {bills.slice(0, 3).map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                />
              ))}
            </section>
          ) : null}
          {late[0] !== undefined ? (
            <AlertCard kind="danger" icon={<TriangleAlert />}>
              <b>{late[0].name}</b> quedó sin pagar en{' '}
              {monthName(late[0].dueDate)}. Mientras no la marquen como pagada
              va a seguir apareciendo acá.
            </AlertCard>
          ) : null}
        </div>
      </div>

      <div className="band">
        <Donut rows={byCategory} />
        {top !== undefined ? (
          <AlertCard kind="warn" icon={<Lightbulb />}>
            Donde más se va la plata es <b>{top.name}</b>:{' '}
            {formatCurrency(top.total)} en el mes.
          </AlertCard>
        ) : null}
      </div>

      <ProjectionLink monthStart={monthStart} />
    </>
  )
}

function PlainHero({
  spent,
  toDate,
}: {
  readonly spent: number
  readonly toDate: ReturnType<typeof computeSpendToDate>
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
        <button className="btn btn-secondary" type="button" disabled>
          <Target />
          Poner un presupuesto
        </button>
      </div>
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
  // The v1 subtracts both: a bill still owed counts against what is left
  // the same as a paid one, because the budget is meant to cover it.
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
          {over ? <TriangleAlert /> : <CalendarDays />}
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

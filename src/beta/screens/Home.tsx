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
import { cardsDueNextMonthTotals } from '@/lib/cards'
import {
  computePendingCommitted,
  computeSpendToDate,
  computeSpentThisMonth,
  formatAmount,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import { monthlyBudgetFor } from '@/lib/households'
import { isBillToPay, pendientesDueInMonth } from '@/lib/pendientes'
import { HomeSkeleton } from '../Skeleton'
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
    return <HomeSkeleton />
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

  // What already left the household's hands this month. Only Expenses: a
  // card purchase has not cost anything yet, and an unpaid bill has not
  // either. Same figure the v1 calls "En uso".
  const paid = computeSpentThisMonth(expenses)

  // What the cards are going to ask for next month, read exactly the way
  // the v1 reads it: off the Resumen the app already keeps per card and
  // month, one figure per currency, never the two added together. It is
  // NOT the sum of this month's purchases -- a purchase in six cuotas
  // sends a sixth of itself to each of six statements.
  const cards = cardsDueNextMonthTotals(pendientes, monthStart)

  // Only what is still unpaid, so a month whose bills were all paid shows
  // nothing owed instead of its whole history.
  const unpaid = pendientes.filter(
    (pendiente) => pendiente.status === 'pending' && isBillToPay(pendiente),
  )
  const bills = sortBills(unpaid, monthStart, now)
  const late = bills.filter(
    (bill) => billState(bill, monthStart, now) === 'late',
  )

  // The v1's rule, to the letter: a bill counts against a month's budget
  // only if it falls due *inside that month*. One due in December does not
  // eat into October, and one already paid counts through its Expense, not
  // twice. This is the figure that was making the beta read two million
  // short.
  const owed = computePendingCommitted(
    pendientesDueInMonth(pendientes, monthStart, monthEnd),
  )
  const budget = monthlyBudgetFor(household, monthStart, now)

  // A month already over is compared whole against the month before it; a
  // month still running is cut at today. Anchoring on `now` whatever month
  // was on screen made every month show the current one's comparison.
  const closed = now > monthEnd
  const toDate = computeSpendToDate(allExpenses, closed ? monthEnd : now)
  const spent = toDate.thisMonth
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
            closed={closed}
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
            <span className="amt">
              {cards.length === 0
                ? formatCurrency(0)
                : cards.map(({ currency, total }) => (
                    <span className="one" key={currency}>
                      {formatAmount(total, currency)}
                    </span>
                  ))}
            </span>
            <span className="foot">
              Lo que van a pedir los resúmenes el mes que viene.
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
  closed,
}: {
  readonly budget: number
  readonly spent: number
  readonly owed: number
  readonly now: Date
  readonly monthEnd: Date
  readonly closed: boolean
}): ReactElement {
  // The v1 subtracts both: a bill still owed counts against what is left
  // the same as a paid one, because the budget is meant to cover it. What
  // it never does is count a bill of another month -- see `owed` above.
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
          {closed
            ? over
              ? `El mes cerró pasado por ${formatCurrency(-left)}.`
              : `El mes cerró con ${formatCurrency(left)} sin usar.`
            : over
              ? `Quedan ${String(daysLeft)} días y ya se pasaron por ${formatCurrency(-left)}.`
              : `Quedan ${String(daysLeft)} días. Pueden gastar ${formatCurrency(perDay)} por día.`}
        </span>
      </div>
    </div>
  )
}

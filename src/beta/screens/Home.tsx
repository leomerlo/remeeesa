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
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/expenses'
import { Figure } from '../Figure'
import { homeFigures } from '../figures'
import type { HomeFigures } from '../figures'
import { HomeSkeleton, Skel } from '../Skeleton'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import {
  AlertCard,
  BillRow,
  Donut,
  ExpenseRow,
  ProjectionLink,
  PurchaseRow,
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

  // The greeting and the month pager are true before anything is
  // fetched -- the name comes from the session, not the household -- so
  // they are drawn first and stay put.
  const greeting = (subtitle: ReactNode): ReactElement => (
    <header className="head">
      <div className="hello">
        Hola, {session.displayName ?? 'vos'} 👋
        <span>{subtitle}</span>
      </div>
      <MonthPager />
    </header>
  )

  if (data.isPending) {
    return (
      <>
        {greeting(<Skel w="70%" h={15} />)}
        <HomeSkeleton />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        {greeting('No pudimos leer el mes.')}
        <LoadFailed />
      </>
    )
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

  const figures = homeFigures({
    household,
    expenses,
    allExpenses,
    pendientes,
    categories,
    monthStart,
    monthEnd,
    now,
  })
  const { budget, paid, owed, cards, bills, late, byCategory, toDate, spent } =
    figures
  const top = byCategory[0]
  const several = members.length > 1
  const others = members
    .map((member) => member.displayName)
    .filter((name) => name !== session.displayName)

  return (
    <>
      {greeting(
        `Estos son los gastos de ${household.name}, tuyos${
          others.length > 0 ? ` y de ${others.join(' y ')}` : ''
        }, del mes de ${monthName(monthStart)}.`,
      )}

      {/* The month's figure and the three figures behind it are one
          answer, and were four separate white cards giving it in pieces.
          One dark panel instead, divided by hairlines rather than by
          edges: the numbers carry the structure, and the only colour in
          it is each figure's own. The greeting and the month pager stay
          outside it -- they say who and when, not how much. */}
      <div className="hood">
        <div className="band">
          {budget > 0 ? (
            <BudgetHero figures={figures} />
          ) : (
            <PlainHero spent={spent} toDate={toDate} />
          )}

          <div className="trio">
            <div className="card out">
              <span className="cap">
                <span className="dot dot-paid" />
                Pagado
              </span>
              <Figure className="amt" amount={paid} />
              <span className="foot">Ya salió de la cuenta.</span>
            </div>
            <div className="card wait">
              <span className="cap">
                <span className="dot dot-owed" />
                Pendiente
              </span>
              <Figure className="amt" amount={owed} />
              <span className="foot">
                Cuentas que vencen y todavía no pagaron.
              </span>
            </div>
            <Link className="card cardtot" to="/cuentas">
              <span className="cap">
                <span className="dot dot-card" />
                Con la tarjeta
              </span>
              <span className="amt">
                {cards.length === 0 ? (
                  <Figure amount={0} />
                ) : (
                  cards.map(({ currency, total }) => (
                    <Figure
                      className="one"
                      key={currency}
                      amount={total}
                      currency={currency}
                    />
                  ))
                )}
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
  readonly toDate: HomeFigures['toDate']
}): ReactElement {
  const up = toDate.difference >= 0
  return (
    <div className="card hero hero-split">
      <div className="h-main">
        <div className="label">El hogar lleva gastado este mes</div>
        <div className="figure">
          <Figure amount={spent} />
        </div>
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
  figures,
}: {
  readonly figures: HomeFigures
}): ReactElement {
  const { budget, paid, owed, left, over, closed, daysLeft, perDay } = figures
  const { pctSpent, pctOwed } = figures

  return (
    <div className="card hero">
      <div className="label">
        {over
          ? 'El hogar se pasó del presupuesto'
          : 'Le queda al hogar este mes'}
      </div>
      <div className={over ? 'figure over' : 'figure'}>
        <Figure amount={left} />
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
          <i className="dot-spent" />
          Gastado <b>{formatCurrency(paid)}</b>
        </span>
        {owed > 0 ? (
          <span>
            <i className="dot-owed" />
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

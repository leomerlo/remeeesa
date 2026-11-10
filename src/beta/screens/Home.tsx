import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Lightbulb,
  Target,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/expenses'
import type { Expense } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import type { Pendiente } from '@/lib/pendientes'
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
import { GastoSheet } from '../sheets/GastoSheet'
import { ServicioSheet } from '../sheets/ServicioSheet'
import { PresupuestoSheet } from '../sheets/PresupuestoSheet'
import { LoadFailed } from './Gastos'

// How many rows each of the two lists on the Home shows. One number, so
// they are always the same length.
const HOME_ROWS = 4

export function Home({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const [budgeting, setBudgeting] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [editingPurchase, setEditingPurchase] = useState<CardPurchase | null>(
    null,
  )
  // Inicio shows the same two lists the other screens show, and a row on
  // it opens the same form. The one thing it does not carry is "Ya lo
  // pagué": that footer is a row taller than a movement, so the two
  // columns stopped matching. Paying is what the Servicios screen is
  // for, and it is one tap away.
  const [editingBill, setEditingBill] = useState<Pendiente | null>(null)
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
        methods,
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
        // Only so a movement can be opened from here: the form needs the
        // payment methods to offer. Inicio shows the same card Gastos
        // shows, and a card that cannot be opened on one screen and can
        // on the other is two cards.
        session.db.listCards({ householdId: id }),
      ])
      return {
        household,
        expenses,
        pendientes,
        allExpenses,
        purchases,
        categories,
        members,
        methods,
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
      <div className="pagerow">
        <MonthPager />
      </div>
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
    methods,
  } = data.data

  const figures = homeFigures({
    household,
    expenses,
    purchases,
    allExpenses,
    pendientes,
    categories,
    methods,
    monthStart,
    monthEnd,
    now,
  })
  const { budget, paid, owed, cards, bills, late, byCategory, toDate, spent } =
    figures
  // Both columns the same height: a list of three beside a list of four
  // read as two unrelated things, and the eye goes to the longer one.
  // Movements are one list -- a consumo and a gasto are both "what we
  // spent" -- newest first; the bills go by the date they fall due, which
  // is the order somebody paying them works in.
  const moves = [
    ...expenses.map((expense) => ({
      id: expense.id,
      at: expense.expenseDate,
      expense,
      purchase: undefined,
    })),
    ...purchases.map((purchase) => ({
      id: purchase.id,
      at: purchase.purchaseDate,
      expense: undefined,
      purchase,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, HOME_ROWS)
  const soonest = [...bills]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .slice(0, HOME_ROWS)
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
            <BudgetHero figures={figures} onBudget={() => setBudgeting(true)} />
          ) : (
            <PlainHero
              spent={spent}
              toDate={toDate}
              onBudget={() => setBudgeting(true)}
            />
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
                Servicios que vencen y todavía no pagaron.
              </span>
            </div>
            <Link className="card cardtot" to="/tarjetas">
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
            <h2>Últimos movimientos</h2>
            {moves.map((move) =>
              move.expense === undefined ? (
                <PurchaseRow
                  key={move.id}
                  purchase={move.purchase}
                  categories={categories}
                  several={several}
                  onEdit={() => setEditingPurchase(move.purchase ?? null)}
                />
              ) : (
                <ExpenseRow
                  key={move.id}
                  expense={move.expense}
                  categories={categories}
                  several={several}
                  onEdit={() => setEditing(move.expense ?? null)}
                />
              ),
            )}
            {/* At the foot of the list rather than beside its heading: it
                is what you reach for once you have read the last row, and
                up there it was a small link competing with the title. */}
            <Link className="btn btn-secondary btn-wide" to="/gastos">
              <ArrowRight />
              Ver todos los gastos
            </Link>
          </section>
        </div>
        <div className="col">
          {bills.length > 0 ? (
            <section className="sec">
              <h2>Servicios por pagar</h2>
              {soonest.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                  several={several}
                  onEdit={() => setEditingBill(bill)}
                />
              ))}
              <Link className="btn btn-secondary btn-wide" to="/servicios">
                <ArrowRight />
                Ver todos los servicios
              </Link>
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
        <Link className="btn btn-secondary btn-wide" to="/categorias">
          <ArrowRight />
          Ver por categoría
        </Link>
      </div>

      <ProjectionLink monthStart={monthStart} />

      {editing === null ? null : (
        <GastoSheet
          open
          onClose={() => setEditing(null)}
          session={session}
          expense={editing}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      )}
      {editingPurchase === null ? null : (
        <GastoSheet
          open
          onClose={() => setEditingPurchase(null)}
          session={session}
          expense={null}
          purchase={editingPurchase}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      )}
      {editingBill === null ? null : (
        <ServicioSheet
          open
          onClose={() => setEditingBill(null)}
          session={session}
          bill={editingBill}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      )}
      <PresupuestoSheet
        open={budgeting}
        onClose={() => setBudgeting(false)}
        session={session}
        household={household}
        monthStart={monthStart}
      />
    </>
  )
}

function PlainHero({
  spent,
  toDate,
  onBudget,
}: {
  readonly spent: number
  readonly toDate: HomeFigures['toDate']
  readonly onBudget: () => void
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
        <button className="btn btn-secondary" type="button" onClick={onBudget}>
          <Target />
          Poner un presupuesto
        </button>
      </div>
    </div>
  )
}

function BudgetHero({
  figures,
  onBudget,
}: {
  readonly figures: HomeFigures
  readonly onBudget: () => void
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
      <button className="skip" type="button" onClick={onBudget}>
        Cambiar el presupuesto
      </button>
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

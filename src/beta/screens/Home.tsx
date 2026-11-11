import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  ChartPie,
  Plus,
  ReceiptText,
  CalendarDays,
  ChevronRight,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { isServicio } from '@/lib/expenses'
import type { Expense } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import type { Pendiente } from '@/lib/pendientes'
import { Figure } from '../Figure'
import {
  cardCategoryIds,
  categoryMovements,
  homeFigures,
  sumIn,
} from '../figures'
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
import { formatCurrency, monthName } from '../format'
import type { BetaSession } from '../data'
import { GastoSheet } from '../sheets/GastoSheet'
import { ServicioSheet } from '../sheets/ServicioSheet'
import { CategoriaMesSheet } from '../sheets/CategoriaMesSheet'
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
  // Adding from an empty column. A household that has just signed up sees
  // nothing but headings otherwise, and the one thing it needs is the way
  // in -- which is on the screen already, but not where somebody looking
  // at an empty list is looking.
  const [adding, setAdding] = useState<'gasto' | 'servicio' | null>(null)
  // The category whose month is open: tapping a slice of the ring shows
  // what it is made of.
  const [openCategory, setOpenCategory] = useState<string | null>(null)
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
        cuotas,
        settled,
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
        // And everything bought in the two years before it, because a
        // purchase in cuotas goes on counting in the months that pay it
        // off -- see monthByCategory. Twenty-four months is the longest
        // run of cuotas there is, so nothing older can still land here.
        session.db.listCardPurchasesInMonth({
          householdId: id,
          monthStart: new Date(
            monthStart.getFullYear(),
            monthStart.getMonth() - 24,
            1,
          ),
          monthEnd,
        }),
        // The month's bills already paid: Firestore keeps them out of
        // listPendientes, and the column on Inicio says "Servicios", not
        // "Servicios por pagar".
        session.db.listPaidPendientesDueInMonth({
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
        cuotas,
        settled,
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
    cuotas,
    settled,
    categories,
    members,
    methods,
  } = data.data

  const figures = homeFigures({
    household,
    expenses,
    // The window, not the month: the ring counts a purchase one cuota at
    // a time. The month's own purchases are the list of movements below.
    purchases: cuotas,
    allExpenses,
    pendientes,
    settled,
    categories,
    methods,
    monthStart,
    monthEnd,
    now,
  })
  const {
    budget,
    owed,
    owedUsd,
    owedBefore,
    cards,
    bills,
    late,
    byCategory,
    cardBills,
  } =
    figures
  // Both columns the same height: a list of three beside a list of four
  // read as two unrelated things, and the eye goes to the longer one.
  // Movements are one list -- a consumo and a gasto are both "what we
  // spent" -- newest first; the bills go by the date they fall due, which
  // is the order somebody paying them works in.
  const cardCategories = cardCategoryIds({ pendientes, categories })
  // "Pagado" said one word for two different things, and one of them
  // never stops growing: a café bought on the way home is not a bill
  // anybody paid. Split the way the screens themselves are split, so
  // each figure is the one its own screen shows. Per direct feedback:
  // "pone gastos realizados y servicios pagados".
  const spent = sumIn(
    expenses
      .filter(
        (expense) =>
          !isServicio(expense) && !cardCategories.has(expense.categoryId),
      )
      .map((expense) => ({
        price: expense.price,
        currency: expense.currency ?? 'ARS',
      })),
    'ARS',
  )
  const serviciosPaid = sumIn(
    expenses
      .filter((expense) => isServicio(expense))
      .map((expense) => ({
        price: expense.price,
        currency: expense.currency ?? 'ARS',
      })),
    'ARS',
  )
  // The same three in dollars. They are never added to the pesos and they
  // never touch the budget -- the ceiling is in pesos and there is no rate
  // this app is willing to pick -- but leaving them off the first screen
  // is not the same as keeping them apart: a month spent on Meta Ads and
  // herramientas looked empty here while the money was plainly gone.
  // Every other screen has said them for months. Per direct feedback:
  // "informativamente tiene que mostrarse, por más que no afecte".
  const inUsd = (kept: (expense: Expense) => boolean): number =>
    sumIn(
      expenses.filter(kept).map((expense) => ({
        price: expense.price,
        currency: expense.currency ?? 'ARS',
      })),
      'USD',
    )
  const spentUsd = inUsd(
    (expense) =>
      !isServicio(expense) && !cardCategories.has(expense.categoryId),
  )
  const serviciosPaidUsd = inUsd((expense) => isServicio(expense))
  const moves = [
    // Paying a servicio writes a gasto -- that is how the money leaves
    // the month -- but the gym is not something the household bought
    // today, and listing it here alongside the café made one record read
    // as two. It is on Servicios, where it belongs. The same goes for
    // what paying a card's Resumen wrote: that is the Visa being paid,
    // and it belongs on Tarjetas. Per direct feedback: "están
    // apareciendo en gastos cosas que son servicios", "se comporta como
    // tarjeta".
    ...expenses
      .filter(
        (expense) =>
          !isServicio(expense) && !cardCategories.has(expense.categoryId),
      )
      .map((expense) => ({
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
  // Already in the order Servicios shows them in -- re-sorting by due
  // date here was what undid it.
  const soonest = bills.slice(0, HOME_ROWS)
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
          ) : null}

          {/* With a budget, three cards across the foot of the panel. With
              none, the two that say what the month did stay side by side
              and the card's own figure takes the full width under them --
              the shape reads faster, and it is the whole of the panel, so
              there is nothing above it to shrink them against. */}
          {/* The same four, with a budget or without one. "pairplus" was
              the no-budget shape back when this panel held three cards
              and one of them carried the only action on the screen; the
              action lives under the panel now and the shape is one. */}
          <div className="trio four">
            <div className="card out">
              <span className="cap">
                <span className="dot dot-paid" />
                Gastos realizados
              </span>
              <span className="amt">
                <Figure className="one" amount={spent} />
                {spentUsd > 0 ? (
                  <Figure className="one" amount={spentUsd} currency="USD" />
                ) : null}
              </span>
              <span className="foot">
                Gastos que realizás una vez. Ejemplo, café o comida.
              </span>
            </div>
            <div className="card out">
              <span className="cap">
                <span className="dot dot-paid" />
                Servicios pagados
              </span>
              <span className="amt">
                <Figure className="one" amount={serviciosPaid} />
                {serviciosPaidUsd > 0 ? (
                  <Figure
                    className="one"
                    amount={serviciosPaidUsd}
                    currency="USD"
                  />
                ) : null}
              </span>
              <span className="foot">
                Servicios que se pagan mensualmente o de forma recurrente.
              </span>
            </div>
            <div className="card wait">
              <span className="cap">
                <span className="dot dot-owed" />
                Servicios por pagar
              </span>
              <span className="amt">
                <Figure className="one" amount={owed} />
                {owedUsd > 0 ? (
                  <Figure className="one" amount={owedUsd} currency="USD" />
                ) : null}
              </span>
              {/* How much of it is arrears, said here rather than left
                  to be inferred: a month that has just inherited five of
                  the municipality's should say so and not only look
                  expensive. */}
              <span className="foot">
                {owedBefore > 0
                  ? `Incluye ${formatCurrency(owedBefore)} que viene de meses anteriores y todavía hay que pagar.`
                  : 'Servicios que se pagan mensualmente o de forma recurrente, y todavía no se pagaron.'}
              </span>
            </div>
            <Link className="card cardtot" to="/tarjetas">
              <span className="cap">
                <span className="dot dot-card" />
                Gastos hechos con la tarjeta
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
      {/* Under the panel and to its right, where every other "and now
          what" in this app sits -- "Ver todos los gastos", "Ver por
          categoría". Inside one of the cards it pushed that card taller
          than the three beside it, so a button for the panel was bending
          the panel's own grid. */}
      {budget > 0 ? null : (
        <button
          className="btn btn-secondary btn-wide"
          type="button"
          onClick={() => setBudgeting(true)}
        >
          <Target />
          Poner un presupuesto
        </button>
      )}

      <div className="cols">
        <div className="col">
          <section className="sec">
            <h2>Últimos gastos</h2>
            {moves.length === 0 ? (
              <div className="card empty">
                <span className="orb" aria-hidden="true">
                  <ReceiptText />
                </span>
                <h3>Todavía no hay gastos anotados</h3>
                <p>
                  Acá aparecen los gastos del día a día, ordenados por fecha.
                  Los que se repiten todos los meses van en Servicios.
                </p>
                {/* Named apart from the one in the header, which is on
                    screen at the same time: two buttons with one name is
                    one button as far as anybody reading is concerned. */}
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setAdding('gasto')}
                >
                  <Plus />
                  Anotar el primero
                </button>
              </div>
            ) : null}
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
                up there it was a small link competing with the title. Not
                offered at all while there is no list: a way through to an
                empty screen is not a next step. */}
            {moves.length === 0 ? null : (
              <Link className="btn btn-secondary btn-wide" to="/gastos">
                <ArrowRight />
                Ver todos los gastos
              </Link>
            )}
          </section>
        </div>
        <div className="col">
          {bills.length === 0 ? (
            <section className="sec">
              <h2>Servicios</h2>
              <div className="card empty">
                <span className="orb" aria-hidden="true">
                  <CalendarClock />
                </span>
                <h3>Todavía no hay servicios</h3>
                <p>
                  Son los pagos que se repiten todos los meses: la luz, el
                  gas, el alquiler. Se cargan una vez y vuelven solos, cada
                  uno con su fecha de vencimiento.
                </p>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setAdding('servicio')}
                >
                  <Plus />
                  Agregar un servicio
                </button>
              </div>
            </section>
          ) : null}
          {bills.length > 0 ? (
            <section className="sec">
              <h2>Servicios</h2>
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
        {byCategory.length === 0 && cardBills.length === 0 ? (
          <div className="card empty">
            <span className="orb" aria-hidden="true">
              <ChartPie />
            </span>
            <h3>Todavía no hay nada para repartir</h3>
            <p>
              Cuando haya gastos anotados, acá se reparte el total del mes
              por categoría.
            </p>
          </div>
        ) : (
          <>
            <Donut
              rows={byCategory}
              cardBills={cardBills}
              onPick={setOpenCategory}
            />
            <Link className="btn btn-secondary btn-wide" to="/categorias">
              <ArrowRight />
              Ver por categoría
            </Link>
          </>
        )}
      </div>

      <ProjectionLink monthStart={monthStart} />

      {adding === null ? null : adding === 'gasto' ? (
        <GastoSheet
          open
          onClose={() => setAdding(null)}
          session={session}
          expense={null}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      ) : (
        <ServicioSheet
          open
          onClose={() => setAdding(null)}
          session={session}
          bill={null}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      )}
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
      {/* What a slice is made of. Built from categoryMovements, which
          reads the same three lists the slice itself is made of, so the
          rows here always add up to the figure there. */}
      {openCategory === null ? null : (
        <CategoriaMesSheet
          open
          onClose={() => setOpenCategory(null)}
          name={
            categories.find((one) => one.id === openCategory)?.name ??
            'Sin categoría'
          }
          monthStart={monthStart}
          movements={categoryMovements({
            categoryId: openCategory,
            expenses,
            purchases: cuotas,
            pendientes,
            categories,
            methods,
            monthStart,
            monthEnd,
          })}
        />
      )}
    </>
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
      {/* The same control as "poner un presupuesto" on the month that
          has none: it is the same errand, and as a text link it read as
          a footnote to the legend above it. */}
      <button className="btn btn-secondary" type="button" onClick={onBudget}>
        <Target />
        Cambiar el presupuesto
      </button>
      {/* Only while the month is running. On a month that has ended it
          said "el mes cerró con X sin usar", which is the figure right
          above it said twice, in an alert, about something nobody can do
          anything about any more. */}
      {closed ? null : (
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
      )}
    </div>
  )
}

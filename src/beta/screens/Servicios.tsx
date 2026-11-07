import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarClock, CreditCard, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { formatAmount } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'
import { billsOnCard, billsOnCardTotal, serviciosFigures } from '../figures'

import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { useMonth } from '../MonthContext'
import { BillRow } from '../rows'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { PagarSheet, ServicioSheet } from '../sheets/ServicioSheet'
import { LoadFailed, Title } from './Gastos'

export function Servicios({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  // Which of the two the screen is on lives in the address rather than in
  // state, so somewhere else can send you straight to one. Replaced rather than pushed: the
  // back button should leave the screen, not walk back through tabs.
  const [params, setParams] = useSearchParams()
  const view = params.get('ver') === 'tarjetas' ? 'tarjetas' : 'pagar'
  const setView = (next: 'pagar' | 'tarjetas'): void => {
    setParams(next === 'tarjetas' ? { ver: 'tarjetas' } : {}, { replace: true })
  }
  // Null is shut, 'nuevo' is creating one, a bill is editing that one.
  const [editing, setEditing] = useState<Pendiente | 'nuevo' | null>(null)
  const [paying, setPaying] = useState<Pendiente | null>(null)
  const householdId = session.householdId ?? null
  const now = new Date()
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'servicios', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      // The expenses and the members are here for one thing: saying who
      // paid a bill. A Pendiente does not carry a name -- the payment
      // does, on the gasto it wrote -- so paidExpenseId is looked up
      // against the month's gastos.
      const [pendientes, categories, methods, settled, expenses, members] =
        await Promise.all([
          session.db.listPendientes({ householdId: id }),
          session.db.listCategories(id),
          session.db.listCards({ householdId: id }),
          session.db.listPaidPendientesDueInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listExpensesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listMembers(id),
        ])
      // A bill paid with a credit card wrote a consumo, not a gasto, so
      // the card it was paid with is on the purchase. Fetched by id in one
      // call: the purchase can be from any month, so no month query finds
      // it.
      //
      // Over both lists, and that is the whole point: listPendientes
      // returns only what is still owed, so a paid bill -- the only kind
      // that has a payment to name -- lives in `settled` alone. Reading
      // one list left every card payment saying "con tarjeta" instead of
      // naming the card.
      const purchaseIds = [...pendientes, ...settled]
        .map((pendiente) => pendiente.paidPurchaseId)
        .filter((purchaseId): purchaseId is string => purchaseId != null)
      const payments =
        purchaseIds.length === 0
          ? []
          : await session.db.getCardPurchases({
              householdId: id,
              purchaseIds,
            })
      return {
        pendientes,
        categories,
        methods,
        settled,
        expenses,
        members,
        payments,
      }
    },
  })

  const segment = (
    <div className="segment">
      <button
        type="button"
        aria-pressed={view === 'pagar'}
        onClick={() => setView('pagar')}
      >
        Del mes
      </button>
      <button
        type="button"
        aria-pressed={view === 'tarjetas'}
        onClick={() => setView('tarjetas')}
      >
        Con tarjeta
      </button>
    </div>
  )

  if (data.isPending) {
    return (
      <>
        <Title text="Servicios" sub={<NameSkel />} pager />
        {segment}
        <ListSkeleton label="Cargando los servicios" rows={4} />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Servicios" />
        <LoadFailed />
      </>
    )
  }

  const {
    pendientes,
    categories,
    methods,
    settled,
    expenses,
    members,
    payments,
  } = data.data
  const several = members.length > 1
  const authorOf = new Map(
    expenses.map((expense) => [expense.id, expense.authorDisplayName]),
  )
  // Null on a bill nobody has paid, and on one paid with a card -- that
  // payment wrote a consumo, not a gasto, and the consumo is not read here.
  const paidByOf = (bill: Pendiente): string | null =>
    bill.paidExpenseId === null
      ? null
      : (authorOf.get(bill.paidExpenseId) ?? null)
  // What it was paid with. Decided at the moment of payment, not on the
  // bill -- a servicio paid in cash for a year and then put on automatic
  // debit is the same servicio -- so it is read off whatever that payment
  // wrote: a gasto with a method on it, or a consumo on a card.
  const cardName = new Map(methods.map((method) => [method.id, method.name]))
  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]))
  const purchaseById = new Map(
    payments.map((purchase) => [purchase.id, purchase]),
  )
  const paidWithOf = (bill: Pendiente): string | null => {
    if (bill.paidPurchaseId != null) {
      const purchase = purchaseById.get(bill.paidPurchaseId)
      return purchase === undefined
        ? null
        : (cardName.get(purchase.cardId) ?? null)
    }
    if (bill.paidExpenseId === null) return null
    const expense = expenseById.get(bill.paidExpenseId)
    if (expense === undefined) return null
    return expense.paymentMethodId === null
      ? 'efectivo'
      : (cardName.get(expense.paymentMethodId) ?? null)
  }

  // Bills of this month settled with a credit card -- see figures.ts for
  // why this reads the paid ones. Where they end up is Tarjetas.
  const onCard = billsOnCard(settled)

  const { unpaid, paid, owed, owedUsd, late } = serviciosFigures({
    pendientes,
    settled,
    monthStart,
    monthEnd,
    now,
  })

  const header = (
    <Title
      text="Servicios"
      sub="Todos los gastos que hacen mes a mes para cubrir gastos del hogar o servicios."
      pager
    />
  )

  if (view === 'tarjetas') {
    const total = billsOnCardTotal(settled)
    return (
      <>
        {header}
        {segment}
        {onCard.length === 0 ? (
          <div className="card empty">
            <span className="orb" aria-hidden="true">
              <CreditCard />
            </span>
            <h3>Ningún servicio se pagó con tarjeta</h3>
            <p>
              Cuando marquen un servicio como pagado con una tarjeta de crédito
              va a aparecer acá: esa plata no sale este mes, llega en el
              resumen.
            </p>
          </div>
        ) : (
          <>
            <div className="hood solo">
              <div className="card hero">
                <div className="label">
                  Servicios de {monthName(monthStart)} que pagaron con tarjeta
                </div>
                <div className="figure">
                  <Figure amount={total} />
                </div>
                <div className="legend">
                  <span>
                    Esta plata no salió este mes: va al resumen de{' '}
                    {monthName(nextMonthOf(monthStart))}.
                  </span>
                </div>
              </div>
            </div>
            <div className="sec">
              {onCard.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                  several={several}
                  paidBy={paidByOf(bill)}
                  paidWith={paidWithOf(bill)}
                />
              ))}
            </div>
            <Link className="btn btn-secondary btn-wide" to="/tarjetas">
              <ArrowRight />
              Ver el resumen completo
            </Link>
          </>
        )}
      </>
    )
  }

  return (
    <>
      {header}
      {segment}
      {unpaid.length === 0 && paid.length === 0 ? (
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <CalendarClock />
          </span>
          <h3>No hubo servicios en {monthName(monthStart)}</h3>
          <p>
            Cuando carguen un servicio -- la luz, el gas, las expensas -- lo van
            a ver acá hasta que lo marquen como pagado.
          </p>
        </div>
      ) : (
        <>
          <div className="hood solo">
            <div className="card hero">
              <div className="label">
                {unpaid.length === 0
                  ? `Pagaron todo en ${monthName(monthStart)}`
                  : 'Falta pagar'}
              </div>
              <div className="figure">
                <Figure amount={owed} />
              </div>
              <div className="legend">
                <span>
                  {unpaid.length === 0
                    ? `${String(paid.length)} ${paid.length === 1 ? 'servicio' : 'servicios'} pagados`
                    : `${String(unpaid.length)} ${unpaid.length === 1 ? 'servicio' : 'servicios'} sin pagar`}
                </span>
                {late.length > 0 ? (
                  <span>
                    {late.length === 1
                      ? 'Uno viene de un mes anterior'
                      : `${String(late.length)} vienen de meses anteriores`}
                  </span>
                ) : null}
                {owedUsd > 0 ? (
                  <span>
                    Y <b>{formatAmount(owedUsd, 'USD')}</b> en dólares
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          {unpaid.length > 0 ? (
            <div className="sec">
              {unpaid.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                  several={several}
                  paidBy={paidByOf(bill)}
                  paidWith={paidWithOf(bill)}
                  onEdit={() => setEditing(bill)}
                  onPay={() => setPaying(bill)}
                />
              ))}
            </div>
          ) : null}
          {/* Everything settled goes under everything that is not: it
              needs nothing from anybody, and the month is read top down
              in order of what is still owed. */}
          {paid.length > 0 ? (
            <section className="sec">
              <h2>Ya pagados</h2>
              {paid.map((bill) => (
                <BillRow
                  key={bill.id}
                  bill={bill}
                  categories={categories}
                  monthStart={monthStart}
                  now={now}
                  several={several}
                  paidBy={paidByOf(bill)}
                  paidWith={paidWithOf(bill)}
                  onEdit={() => setEditing(bill)}
                />
              ))}
            </section>
          ) : null}
        </>
      )}
      <button
        className="btn btn-secondary btn-wide"
        type="button"
        onClick={() => setEditing('nuevo')}
      >
        <Plus />
        Agregar un servicio
      </button>
      {editing === null ? null : (
        <ServicioSheet
          open
          onClose={() => setEditing(null)}
          session={session}
          bill={editing === 'nuevo' ? null : editing}
          categories={categories}
          today={now}
          paidWith={editing === 'nuevo' ? null : paidWithOf(editing)}
        />
      )}
      {paying === null ? null : (
        <PagarSheet
          open
          onClose={() => setPaying(null)}
          session={session}
          bill={paying}
          methods={methods}
          today={now}
        />
      )}
    </>
  )
}

function nextMonthOf(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
}

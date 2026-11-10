import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { matchesSearch } from '@/lib/search/fuzzyMatch'
import type { Pendiente } from '@/lib/pendientes'
import { serviciosFigures } from '../figures'

import { ListSkeleton, NameSkel, SearchSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { useMonth } from '../MonthContext'
import { BillRow } from '../rows'
import { formatAmount, monthName } from '../format'
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
  // Null is shut, a bill is the one being edited. Nothing creates one
  // from here any more: a servicio is born in "anotar un gasto", with
  // "todos los meses" on, which is where the v1 puts it too.
  const [editing, setEditing] = useState<Pendiente | null>(null)
  const [paying, setPaying] = useState<Pendiente | null>(null)
  // One box over both tabs: looking for the luz, you do not first want to
  // know whether you paid it with a card.
  const [query, setQuery] = useState('')
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

  const finder = (
    <div className="search">
      <span className="mag" aria-hidden="true">
        <Search />
      </span>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar un servicio"
        aria-label="Buscar un servicio"
        autoComplete="off"
      />
      {query === '' ? null : (
        <button
          className="clr"
          type="button"
          onClick={() => setQuery('')}
          aria-label="Borrar la búsqueda"
        >
          <X />
        </button>
      )}
    </div>
  )

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
        <SearchSkel />
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

  // The search narrows the bills themselves, before anything is counted,
  // so every figure on the screen is the figure of what is on it: the
  // total over a filtered list that still said the whole month would be
  // the one number here nobody could check.
  // Its name and its category, because "casa" is a fair way to look for
  // the expensas.
  const categoryNameOf = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  const asked = query.trim() !== ''
  const matches = (bill: Pendiente): boolean =>
    matchesSearch(query, [bill.name, categoryNameOf.get(bill.categoryId)])
  const shownPendientes = pendientes.filter(matches)
  const shownSettled = settled.filter(matches)

  // The month's two sides: what it pays itself, and what its cards pay
  // for it. A bill is on exactly one of them -- see figures.ts.
  const { unpaid, paid, owed, owedUsd, late, onCard, onCardTotal } =
    serviciosFigures({
      pendientes: shownPendientes,
      settled: shownSettled,
      methods,
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
    return (
      <>
        {header}
        {finder}
        {segment}
        {onCard.length === 0 && asked ? (
          <NoMatch query={query} onClear={() => setQuery('')} />
        ) : onCard.length === 0 ? (
          <div className="card empty">
            <span className="orb" aria-hidden="true">
              <CreditCard />
            </span>
            <h3>Ningún servicio lo paga una tarjeta</h3>
            <p>
              Un servicio que se paga con una tarjeta de crédito aparece acá:
              esa plata no sale este mes, llega en el resumen de la tarjeta. Se
              elige con el «¿con qué se paga?» del servicio.
            </p>
          </div>
        ) : (
          <>
            <div className="hood solo">
              <div className="card hero">
                <div className="label">
                  Servicios de {monthName(monthStart)} que paga la tarjeta
                </div>
                <div className="figure">
                  <Figure amount={onCardTotal} />
                </div>
                <div className="legend">
                  <span>
                    Esta plata no sale este mes: va al resumen de{' '}
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
      {finder}
      {segment}
      {unpaid.length === 0 && paid.length === 0 ? (
        asked ? (
          <NoMatch query={query} onClear={() => setQuery('')} />
        ) : (
          <div className="card empty">
            <span className="orb" aria-hidden="true">
              <CalendarClock />
            </span>
            <h3>No hubo servicios en {monthName(monthStart)}</h3>
            <p>
              Cuando carguen un servicio -- la luz, el gas, las expensas -- lo
              van a ver acá hasta que lo marquen como pagado.
            </p>
          </div>
        )
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
              {/* Under the pesos and at a size worth reading, not in the
                  legend's far corner: a month owed in two currencies is
                  owed both of them, and the second was sitting there
                  looking like a footnote to the first. */}
              {owedUsd > 0 ? (
                <p className="usdline">
                  <b>{formatAmount(owedUsd, 'USD')}</b>
                </p>
              ) : null}
              {/* The same badges the rows wear, for the same reason: how
                  many are still owed is the one thing on this card you
                  have to do something about, and in the legend's grey it
                  read like a caption. */}
              <div className="herotags">
                {unpaid.length === 0 ? (
                  <span className="tag ok">
                    <Check />
                    {`${String(paid.length)} ${paid.length === 1 ? 'servicio pagado' : 'servicios pagados'}`}
                  </span>
                ) : (
                  <span className="tag due">
                    <TriangleAlert />
                    {`${String(unpaid.length)} ${unpaid.length === 1 ? 'servicio sin pagar' : 'servicios sin pagar'}`}
                  </span>
                )}
                {late.length > 0 ? (
                  <span className="tag late">
                    <TriangleAlert />
                    {late.length === 1
                      ? 'Uno viene de un mes anterior'
                      : `${String(late.length)} vienen de meses anteriores`}
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
      {editing === null ? null : (
        <ServicioSheet
          open
          onClose={() => setEditing(null)}
          session={session}
          bill={editing}
          categories={categories}
          methods={methods}
          today={now}
          paidWith={paidWithOf(editing)}
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

// A search that matched nothing is not an empty month, and saying "no
// hubo servicios" there is the screen answering a question nobody asked.
function NoMatch({
  query,
  onClear,
}: {
  readonly query: string
  readonly onClear: () => void
}): ReactElement {
  return (
    <div className="card empty">
      <span className="orb" aria-hidden="true">
        <Search />
      </span>
      <h3>Nada que coincida con «{query.trim()}»</h3>
      <p>Probá con menos letras, o con el nombre de la categoría.</p>
      <button className="btn btn-secondary" type="button" onClick={onClear}>
        <X />
        Borrar la búsqueda
      </button>
    </div>
  )
}

function nextMonthOf(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
}

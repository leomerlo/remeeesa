import { useQuery } from '@tanstack/react-query'
import { CreditCard, Plus, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { computeSpentThisMonth, isServicio } from '@/lib/expenses'
import type { Expense } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import type { Currency } from '@/lib/money'
import { cardCategoryIds, sumIn } from '../figures'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import { ExpenseRow, PurchaseRow } from '../rows'
import { formatAmount, monthName } from '../format'
import type { BetaSession } from '../data'
import { GastoSheet } from '../sheets/GastoSheet'

export function Gastos({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const [view, setView] = useState<'mes' | 'tarjeta'>('mes')
  const [editing, setEditing] = useState<Expense | null>(null)
  const [adding, setAdding] = useState(false)
  // The same form, over a consumo on a card instead of a gasto.
  const [editingPurchase, setEditingPurchase] = useState<CardPurchase | null>(
    null,
  )
  const householdId = session.householdId ?? null
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'gastos', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [expenses, purchases, categories, members, methods, pendientes] =
        await Promise.all([
          session.db.listExpensesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          // What went onto a credit card this month. Not Expenses -- the
          // money has not left yet -- which is exactly why they need a
          // place of their own: until now they appeared nowhere but as
          // cuotas inside next month's statement.
          session.db.listCardPurchasesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listCategories(id),
          session.db.listMembers(id),
          session.db.listCards({ householdId: id }),
          // Only to tell which category is a card's own, so what paying a
          // Resumen wrote can be left to Tarjetas.
          session.db.listPendientes({ householdId: id }),
        ])
      // The month's bills that are already paid. listPendientes leaves
      // them out, and they are exactly the ones that have a payment to
      // point at -- a bill paid with a card names the consumo it wrote,
      // and that consumo belongs to the bill and not to this screen.
      const settled = await session.db.listPaidPendientesDueInMonth({
        householdId: id,
        monthStart,
        monthEnd,
      })
      return {
        expenses,
        purchases,
        categories,
        members,
        methods,
        pendientes,
        settled,
      }
    },
  })

  // The chrome is drawn before the data lands and never moves: the title,
  // the month it is showing and the two views are true whatever comes
  // back, and a header that appears a beat later is the jump a loading
  // state exists to prevent.
  const segment = (
    <div className="segment">
      <button
        type="button"
        aria-pressed={view === 'mes'}
        onClick={() => setView('mes')}
      >
        Del mes
      </button>
      <button
        type="button"
        aria-pressed={view === 'tarjeta'}
        onClick={() => setView('tarjeta')}
      >
        Con tarjeta
      </button>
    </div>
  )

  if (data.isPending) {
    return (
      <>
        <Title text="Gastos" sub={<NameSkel />} pager />
        {segment}
        <ListSkeleton label="Cargando los gastos" />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Gastos" />
        <LoadFailed />
      </>
    )
  }

  const { purchases, categories, members, methods, pendientes, settled } =
    data.data
  // Which bill each consumo paid, read off the bills themselves. The
  // consumo carries a mark of its own since the day that was added, but
  // every one written before that day carries nothing -- and this is the
  // link that has always been there, on the side that was always right.
  const billByPurchase = new Map(
    [...pendientes, ...settled].flatMap((bill) =>
      bill.paidPurchaseId == null ? [] : [[bill.paidPurchaseId, bill.id]],
    ),
  )
  const billOf = (purchase: CardPurchase): string | null =>
    purchase.pendienteId ?? billByPurchase.get(purchase.id) ?? null
  // What this screen is for, and what its own subtitle has always said:
  // lo de una vez. Two kinds of gasto are not that, and both were here.
  //
  // Paying a servicio writes a gasto, because that is how the money
  // leaves the month -- but the gym is not something the household
  // bought today. It is on Servicios, with its own figure.
  //
  // Paying a card's Resumen writes one too, per cuota -- but that is the
  // Visa being paid, and it belongs on Tarjetas, which is where the
  // household goes to see what the card is costing. It has always been
  // left out of the ring for the same reason. Per direct feedback: "se
  // comporta como tarjeta".
  //
  // Either one listed here as well made one record read as two. The
  // total below counts what the list shows, so it moves with it; Inicio
  // is where the month's whole figure lives.
  const cards = cardCategoryIds({ pendientes, categories })
  const expenses = data.data.expenses.filter(
    (expense) => !isServicio(expense) && !cards.has(expense.categoryId),
  )
  const several = members.length > 1
  const header = (
    <Title
      text="Gastos"
      sub="Todos los gastos que hacen día a día que no son recurrentes o servicios."
      pager
    />
  )

  // The two tabs are the same list of one month's spending, split by
  // whether the money has left yet. Flattened to one shape here so the
  // search, the day headings and the total are written once: a consumo and
  // a gasto are the same thing to someone looking for what they bought.
  const delMes: readonly Movement[] = expenses.map((expense) => ({
    id: expense.id,
    name: expense.name,
    categoryId: expense.categoryId,
    date: expense.expenseDate,
    price: expense.price,
    currency: expense.currency,
    expense,
  }))
  // A consumo that came from paying a servicio belongs to Servicios, on
  // its "Con tarjeta" side -- the same rule the gastos above follow. It
  // used to be listed here because nothing on it said where it came
  // from. Per direct feedback: "es un servicio, no me tiene que aparecer
  // en gastos".
  const conTarjeta: readonly Movement[] = purchases
    .filter((purchase) => billOf(purchase) === null)
    .map((purchase) => ({
      id: purchase.id,
      name: purchase.name,
      categoryId: purchase.categoryId,
      date: purchase.purchaseDate,
      price: purchase.total,
      currency: purchase.currency,
      purchase,
    }))
  const items = view === 'mes' ? delMes : conTarjeta

  // Pesos only, like every other peso figure in the app: a $45 expense in
  // dollars is not 45 pesos, and adding it in made this screen's total
  // disagree with the Home's by exactly that much. The dollars are said
  // on their own line.
  //
  // Both sides at once, above the tabs and never changing with them: the
  // month paid one of these and owes the other, and switching tabs to see
  // the second figure meant losing sight of the first.
  const hero = (
    <div className="hood solo">
      <div className="duo">
        <div className="card half">
          <div className="label">Pagado en {monthName(monthStart)}</div>
          <div className="figure">
            <Figure amount={computeSpentThisMonth(delMes)} />
          </div>
          {sumIn(delMes, 'USD') > 0 ? (
            <p className="usdline">
              <b>{formatAmount(sumIn(delMes, 'USD'), 'USD')}</b>
            </p>
          ) : null}
          {/* Not the month's whole figure any more: los servicios se
              cuentan en Servicios y el resumen en Tarjetas. Inicio es
              donde viven los tres juntos. */}
          <p className="herosay">
            Plata que ya salió de la cuenta, sin contar los servicios ni el
            resumen de la tarjeta.
          </p>
        </div>
        <div className="card half">
          <div className="label">Con tarjeta en {monthName(monthStart)}</div>
          <div className="figure">
            <Figure amount={computeSpentThisMonth(conTarjeta)} />
          </div>
          {sumIn(conTarjeta, 'USD') > 0 ? (
            <p className="usdline">
              <b>{formatAmount(sumIn(conTarjeta, 'USD'), 'USD')}</b>
            </p>
          ) : null}
          <p className="herosay">
            Lo pagaron con tarjeta de crédito y se paga con el resumen del mes
            que viene.
          </p>
        </div>
      </div>
    </div>
  )

  if (items.length === 0) {
    return (
      <>
        {header}
        {hero}
        {segment}
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            {view === 'mes' ? <ReceiptText /> : <CreditCard />}
          </span>
          <h3>
            {view === 'mes'
              ? 'Todavía no anotaron nada'
              : 'Nada con tarjeta este mes'}
          </h3>
          <p>
            {view === 'mes'
              ? 'Cuando anoten un gasto lo van a ver acá, ordenado por día.'
              : 'Lo que compren con una tarjeta de crédito va a aparecer acá, y lo van a pagar cuando llegue el resumen.'}
          </p>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setAdding(true)}
          >
            <Plus />
            Anotar un gasto
          </button>
        </div>
        {adding ? (
          <GastoSheet
            open
            onClose={() => setAdding(false)}
            session={session}
            expense={null}
            categories={categories}
            methods={methods}
            today={new Date()}
          />
        ) : null}
      </>
    )
  }

  const rows = items.map((item, index) => ({
    item,
    // A day gets a header the first time it appears.
    header:
      index === 0 || items[index - 1]?.date.getDate() !== item.date.getDate(),
  }))

  return (
    <>
      {header}
      {hero}
      {segment}
      <div className="sec">
        {rows.map(({ item, header: dayHeader }) => (
          <div key={item.id}>
            {dayHeader ? (
              <div className="daymark">
                {item.date.getDate()} de {monthName(item.date)}
              </div>
            ) : null}
            {item.expense === undefined ? (
              <PurchaseRow
                purchase={item.purchase as CardPurchase}
                categories={categories}
                methods={methods}
                several={several}
                onEdit={() => setEditingPurchase(item.purchase ?? null)}
              />
            ) : (
              <ExpenseRow
                expense={item.expense}
                categories={categories}
                methods={methods}
                several={several}
                onEdit={() => setEditing(item.expense ?? null)}
              />
            )}
          </div>
        ))}
      </div>
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
          billId={billOf(editingPurchase)}
          categories={categories}
          methods={methods}
          today={new Date()}
        />
      )}
    </>
  )
}

// One month's spending, whichever side of the card it fell on.
type Movement = {
  readonly id: string
  readonly name: string
  readonly categoryId: string
  readonly date: Date
  readonly price: number
  readonly currency: Currency
  readonly expense?: Expense
  readonly purchase?: CardPurchase
}

// The same header the Home has: a name and a line under it on the left,
// the month on the right once there is room for both. Every screen opens
// the same way, which is the point -- the Home used to be the only one
// that said anything about itself.
export function Title({
  text,
  sub,
  pager = false,
}: {
  readonly text: string
  // One line saying what this screen is, in the household's own terms.
  // A placeholder of its size while it loads, so nothing jumps.
  readonly sub?: ReactNode
  // true for the app's viewed month; a pager of its own for a screen that
  // pages something else.
  readonly pager?: boolean | ReactNode
}): ReactElement {
  return (
    <header className="head">
      <div className="hello">
        <h1 className="page-title">{text}</h1>
        {sub === undefined ? null : <span>{sub}</span>}
      </div>
      {pager === true ? (
        <MonthPager />
      ) : pager === false || pager === undefined ? null : (
        pager
      )}
    </header>
  )
}

export function LoadFailed(): ReactElement {
  return (
    <div className="card alert alert-danger">
      <span className="tile" aria-hidden="true" />
      <p>No pudimos leer los datos del hogar. Probá recargar la página.</p>
    </div>
  )
}

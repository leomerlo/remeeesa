import { useQuery } from '@tanstack/react-query'
import { CreditCard, Plus, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { computeSpentThisMonth, formatAmount } from '@/lib/expenses'
import type { Expense } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import type { Currency } from '@/lib/money'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import { ExpenseRow, PurchaseRow } from '../rows'
import { monthName } from '../format'
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
      const [expenses, purchases, categories, members, methods] =
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
        ])
      return { expenses, purchases, categories, members, methods }
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

  const { expenses, purchases, categories, members, methods } = data.data
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
  const items: readonly Movement[] =
    view === 'mes'
      ? expenses.map((expense) => ({
          id: expense.id,
          name: expense.name,
          categoryId: expense.categoryId,
          date: expense.expenseDate,
          price: expense.price,
          currency: expense.currency,
          expense,
        }))
      : purchases.map((purchase) => ({
          id: purchase.id,
          name: purchase.name,
          categoryId: purchase.categoryId,
          date: purchase.purchaseDate,
          price: purchase.total,
          currency: purchase.currency,
          purchase,
        }))

  if (items.length === 0) {
    return (
      <>
        {header}
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

  // Pesos only, like every other peso figure in the app: a $45 expense in
  // dollars is not 45 pesos, and adding it in made this screen's total
  // disagree with the Home's by exactly that much. The dollars are still
  // listed below, and said on their own line.
  const shown = computeSpentThisMonth(items)
  const shownUsd = sumIn(items, 'USD')
  const rows = items.map((item, index) => ({
    item,
    // A day gets a header the first time it appears.
    header:
      index === 0 || items[index - 1]?.date.getDate() !== item.date.getDate(),
  }))

  return (
    <>
      {header}
      {segment}
      <div className="hood solo">
        <div className="card hero">
          <div className="label">
            {view === 'mes'
              ? `Pagado en ${monthName(monthStart)}`
              : `Con tarjeta en ${monthName(monthStart)}`}
          </div>
          <div className="figure">
            <Figure amount={shown} />
          </div>
          <div className="legend">
            <span>
              {view === 'mes'
                ? 'Plata que ya salió de la cuenta.'
                : 'No sale este mes: llega repartido en los resúmenes.'}
            </span>
            {shownUsd > 0 ? (
              <span>
                Y <b>{formatAmount(shownUsd, 'USD')}</b> en dólares, que no
                entran en el total en pesos.
              </span>
            ) : null}
          </div>
        </div>
      </div>
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
                several={several}
                onEdit={() => setEditingPurchase(item.purchase ?? null)}
              />
            ) : (
              <ExpenseRow
                expense={item.expense}
                categories={categories}
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

// What a set of expenses comes to in one currency. Kept out of
// computeSpentThisMonth on purpose: that one answers "what did this cost
// the peso budget", and is right to drop everything else.
function sumIn(
  items: readonly { readonly price: number; readonly currency: Currency }[],
  currency: Currency,
): number {
  return items
    .filter((item) => item.currency === currency)
    .reduce((sum, item) => sum + item.price, 0)
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
  readonly pager?: boolean
}): ReactElement {
  return (
    <header className="head">
      <div className="hello">
        <h1 className="page-title">{text}</h1>
        {sub === undefined ? null : <span>{sub}</span>}
      </div>
      {pager ? <MonthPager /> : null}
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

import { useQuery } from '@tanstack/react-query'
import { Plus, ReceiptText, Search, SearchX, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import {
  computeSpentThisMonth,
  formatAmount,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
import { ListSkeleton, NameSkel, SearchSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import { CategoryTile } from '../Tile'
import { ExpenseRow } from '../rows'
import { categoryMark, monthName } from '../format'
import type { BetaSession } from '../data'

export function Gastos({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const [view, setView] = useState<'lista' | 'cats'>('lista')
  const [query, setQuery] = useState('')
  const householdId = session.householdId ?? null
  const { monthStart, monthEnd } = useMonth()

  const data = useQuery({
    queryKey: ['beta', 'gastos', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [expenses, categories, household, members] = await Promise.all([
        session.db.listExpensesInMonth({
          householdId: id,
          monthStart,
          monthEnd,
        }),
        session.db.listCategories(id),
        session.db.getHousehold(id),
        session.db.listMembers(id),
      ])
      return { expenses, categories, household, members }
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
        aria-pressed={view === 'lista'}
        onClick={() => setView('lista')}
      >
        Lista
      </button>
      <button
        type="button"
        aria-pressed={view === 'cats'}
        onClick={() => setView('cats')}
      >
        Por categoría
      </button>
    </div>
  )

  if (data.isPending) {
    return (
      <>
        <Title text="Gastos" sub={<NameSkel />} pager />
        {segment}
        {view === 'lista' ? <SearchSkel /> : null}
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

  const { expenses, categories, household, members } = data.data
  const several = members.length > 1
  const header = (
    <Title
      text="Gastos"
      sub={`Todo lo que anotaron en ${household.name} durante ${monthName(monthStart)}.`}
      pager
    />
  )

  if (expenses.length === 0) {
    return (
      <>
        {header}
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <ReceiptText />
          </span>
          <h3>Todavía no anotaron nada</h3>
          <p>Cuando anoten un gasto lo van a ver acá, ordenado por día.</p>
          <button className="btn btn-primary" type="button" disabled>
            <Plus />
            Anotar un gasto
          </button>
        </div>
      </>
    )
  }

  // Pesos only, like every other peso figure in the app: a $45 expense in
  // dollars is not 45 pesos, and adding it in made this screen's total
  // disagree with the Home's by exactly that much. The dollars are still
  // listed below, and said on their own line.
  const total = computeSpentThisMonth(expenses)
  const totalUsd = sumIn(expenses, 'USD')

  if (view === 'cats') {
    return (
      <>
        {header}
        {segment}
        <div className="card hero">
          <div className="label">Total de {monthName(monthStart)}</div>
          <div className="figure">
            <Figure amount={total} />
          </div>
          {totalUsd > 0 ? (
            <div className="legend">
              <span>
                Y <b>{formatAmount(totalUsd, 'USD')}</b> en dólares, que no
                entran en el total en pesos.
              </span>
            </div>
          ) : null}
        </div>
        <CategoryBars expenses={expenses} categories={categories} />
      </>
    )
  }

  // The v1's forgiving search, used as-is: accents and case ignored, terms
  // matched in any order, a character or two allowed wrong.
  const found = query
    ? expenses.filter((expense) =>
        matchesSearch(query, [
          expense.name,
          categoryMark(categories, expense.categoryId).name,
          expense.authorDisplayName,
          expense.comments,
        ]),
      )
    : expenses
  const shown = computeSpentThisMonth(found)
  const shownUsd = sumIn(found, 'USD')
  const rows = found.map((expense, index) => ({
    expense,
    // A day gets a header the first time it appears.
    header:
      index === 0 ||
      found[index - 1]?.expenseDate.getDate() !== expense.expenseDate.getDate(),
  }))

  return (
    <>
      {header}
      {segment}
      <div className="search">
        <span className="mag" aria-hidden="true">
          <Search />
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar un gasto"
          aria-label="Buscar un gasto"
          autoComplete="off"
        />
        {query ? (
          <button
            className="clr"
            type="button"
            onClick={() => setQuery('')}
            aria-label="Borrar la búsqueda"
          >
            <X />
          </button>
        ) : null}
      </div>
      <div className="card hero">
        <div className="label">
          {query
            ? `${String(found.length)} de ${String(expenses.length)} gastos`
            : `Total de ${monthName(monthStart)}`}
        </div>
        <div className="figure">
          <Figure amount={shown} />
        </div>
        {shownUsd > 0 ? (
          <div className="legend">
            <span>
              Y <b>{formatAmount(shownUsd, 'USD')}</b> en dólares, que no entran
              en el total en pesos.
            </span>
          </div>
        ) : null}
      </div>
      {found.length === 0 ? (
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <SearchX />
          </span>
          <h3>No encontramos nada</h3>
          <p>
            Probá con otra palabra. La búsqueda aguanta acentos y errores de
            tipeo.
          </p>
        </div>
      ) : (
        <div className="sec">
          {rows.map(({ expense, header: dayHeader }) => (
            <div key={expense.id}>
              {dayHeader ? (
                <div className="daymark">
                  {expense.expenseDate.getDate()} de{' '}
                  {monthName(expense.expenseDate)}
                </div>
              ) : null}
              <ExpenseRow
                expense={expense}
                categories={categories}
                several={several}
              />
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// The bar list, not the ring: the ring lives on Inicio and answers "where
// did the month go". This one answers "how is each category doing", which
// is why it measures against the cap when there is one.
function CategoryBars({
  expenses,
  categories,
}: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
}): ReactElement {
  const rows = summarizeByCategory({ expenses, categories })
  const capOf = (categoryId: string): number =>
    categories.find((category) => category.id === categoryId)?.monthlyBudget ??
    0
  const max = rows[0]?.total ?? 0

  return (
    <>
      <div className="sec">
        {rows.map((row) => {
          const cap = capOf(row.categoryId)
          const over = cap > 0 && row.total > cap
          const width =
            cap > 0
              ? Math.min(100, Math.round((row.total / cap) * 100))
              : max > 0
                ? Math.round((row.total / max) * 100)
                : 0
          return (
            <div className="card catrow" key={row.categoryId}>
              <CategoryTile name={row.name} color={row.color} />
              <span className="name">{row.name}</span>
              <span className="amt">{formatCurrency(row.total)}</span>
              <span className="bar">
                <i
                  style={{
                    width: `${String(width)}%`,
                    background: over ? 'var(--red-solid)' : row.color,
                  }}
                />
              </span>
              <span className={over ? 'sub over' : 'sub'}>
                {cap > 0
                  ? over
                    ? `Se pasaron ${formatCurrency(row.total - cap)} del tope de ${formatCurrency(cap)}`
                    : `${formatCurrency(cap - row.total)} por debajo del tope de ${formatCurrency(cap)}`
                  : `${String(Math.round(row.share * 100))}% de lo que gastaron`}
              </span>
            </div>
          )
        })}
      </div>
      <button className="btn btn-secondary btn-block" type="button" disabled>
        <Settings2 />
        Administrar categorías y topes
      </button>
    </>
  )
}

// What a set of expenses comes to in one currency. Kept out of
// computeSpentThisMonth on purpose: that one answers "what did this cost
// the peso budget", and is right to drop everything else.
function sumIn(expenses: readonly Expense[], currency: 'ARS' | 'USD'): number {
  return expenses
    .filter((expense) => expense.currency === currency)
    .reduce((sum, expense) => sum + expense.price, 0)
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

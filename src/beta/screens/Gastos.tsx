import { useQuery } from '@tanstack/react-query'
import { Plus, ReceiptText, Search, SearchX, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { formatCurrency, summarizeByCategory } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
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

  if (data.isPending) {
    return <div className="card" aria-busy="true" style={{ minHeight: 160 }} />
  }
  if (data.isError || data.data === undefined) {
    return <LoadFailed />
  }

  const { expenses, categories, household, members } = data.data
  const several = members.length > 1
  const header = <Title text="Gastos" home={household.name} />

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
  const total = expenses.reduce((sum, expense) => sum + expense.price, 0)

  if (view === 'cats') {
    return (
      <>
        {header}
        <MonthPager />
        {segment}
        <div className="card hero">
          <div className="label">Total de {monthName(monthStart)}</div>
          <div className="figure">{formatCurrency(total)}</div>
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
  const shown = found.reduce((sum, expense) => sum + expense.price, 0)
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
      <MonthPager />
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
        <div className="figure">{formatCurrency(shown)}</div>
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

export function Title({
  text,
  home,
}: {
  readonly text: string
  readonly home?: string
}): ReactElement {
  return (
    <header className="head">
      <h1 className="page-title">{text}</h1>
      {home === undefined ? null : <div className="head-home">{home}</div>}
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

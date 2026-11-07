import { useQuery } from '@tanstack/react-query'
import { Search, SearchX, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  formatAmount,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
import { MonthPager } from '../MonthPager'
import { useMonth } from '../MonthContext'
import { CategoryTile } from '../Tile'
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
      const [expenses, categories] = await Promise.all([
        session.db.listExpensesInMonth({
          householdId: id,
          monthStart,
          monthEnd,
        }),
        session.db.listCategories(id),
      ])
      return { expenses, categories }
    },
  })

  if (data.isPending) {
    return <div className="card" aria-busy="true" style={{ minHeight: 160 }} />
  }
  if (data.isError || data.data === undefined) {
    return <LoadFailed />
  }

  const { expenses, categories } = data.data
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

  if (expenses.length === 0) {
    return (
      <>
        <Title text="Gastos" />
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <Search />
          </span>
          <h3>Todavía no anotaron nada en {monthName(monthStart)}</h3>
          <p>Cuando anoten un gasto lo van a ver acá, ordenado por día.</p>
        </div>
      </>
    )
  }

  if (view === 'cats') {
    return (
      <>
        <Title text="Gastos" />
        <MonthPager />
        {segment}
        <Breakdown expenses={expenses} categories={categories} />
      </>
    )
  }

  // The v1's forgiving search, used as-is: accents and case ignored, terms
  // matched in any order, and a term may be a character or two wrong.
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
  const shown = found.reduce((total, expense) => total + expense.price, 0)

  return (
    <>
      <Title text="Gastos" />
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
        <ExpenseList expenses={found} categories={categories} />
      )}
    </>
  )
}

function ExpenseList({
  expenses,
  categories,
}: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
}): ReactElement {
  const rows = expenses.map((expense, index) => ({
    expense,
    mark: categoryMark(categories, expense.categoryId),
    // A day gets a header the first time it appears.
    header:
      index === 0 ||
      expenses[index - 1]?.expenseDate.getDate() !==
        expense.expenseDate.getDate(),
  }))

  return (
    <div className="sec">
      {rows.map(({ expense, mark, header }) => {
        const day = expense.expenseDate.getDate()
        return (
          <div key={expense.id}>
            {header ? (
              <div className="daymark">
                {day} de {monthName(expense.expenseDate)}
              </div>
            ) : null}
            <div className="card row">
              <CategoryTile name={mark.name} color={mark.color} />
              <span className="name">{expense.name}</span>
              <span className="amt">
                {formatAmount(expense.price, expense.currency)}
              </span>
              <span className="meta">
                <span className="cat">{mark.name}</span>
                <span className="badges">
                  <span className="tag ok">Pagado</span>
                  <span className="who">{expense.authorDisplayName}</span>
                </span>
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Breakdown({
  expenses,
  categories,
}: {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
}): ReactElement {
  const rows = summarizeByCategory({ expenses, categories })
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const circumference = 2 * Math.PI * 52
  // Each arc starts where the ones before it ended.
  const arcs = rows.map((row, index) => ({
    row,
    length: row.share * circumference,
    offset: rows
      .slice(0, index)
      .reduce((sum, earlier) => sum + earlier.share * circumference, 0),
  }))

  return (
    <div className="card donut">
      <div className="lead">Distribuidos por categoría</div>
      <div className="donut-top">
        <svg
          viewBox="0 0 140 140"
          role="img"
          aria-label="Reparto por categoría"
        >
          <g transform="rotate(-90 70 70)">
            {arcs.map(({ row, length, offset }) => (
              <circle
                key={row.categoryId}
                cx="70"
                cy="70"
                r="52"
                fill="none"
                stroke={row.color}
                strokeWidth="19"
                strokeDasharray={`${length.toFixed(2)} ${(circumference - length).toFixed(2)}`}
                strokeDashoffset={(-offset).toFixed(2)}
              />
            ))}
          </g>
          <text className="hole" x="70" y="68" textAnchor="middle">
            {formatCurrency(total)}
          </text>
          <text className="holesub" x="70" y="84" textAnchor="middle">
            EN TOTAL
          </text>
        </svg>
      </div>
      <div className="dlist">
        {rows.map((row) => (
          <div className="dline" key={row.categoryId}>
            <i style={{ background: row.color }} />
            <span className="nm">{row.name}</span>
            <span className="pc">{Math.round(row.share * 100)}%</span>
            <span className="amt">{formatCurrency(row.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Title({ text }: { readonly text: string }): ReactElement {
  return (
    <header className="head">
      <h1 className="page-title">{text}</h1>
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

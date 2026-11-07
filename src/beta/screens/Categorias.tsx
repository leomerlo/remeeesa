import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { formatCurrency, summarizeByCategory } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { useMonth } from '../MonthContext'
import { CategoryTile } from '../Tile'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { CategoriaSheet } from '../sheets/CategoriaSheet'
import { LoadFailed, Title } from './Gastos'

// Its own screen rather than a second view of Gastos. A category says what
// the money was for, and has nothing to do with how it was paid -- which
// is exactly what the two tabs on Gastos are about, so a third tab there
// would have been answering a different question in the same control. Per
// Flor: "las categorías son indistintas del pago".
export function Categorias({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const householdId = session.householdId ?? null
  const { monthStart, monthEnd } = useMonth()
  // Null means the sheet is shut; a category means editing that one; the
  // string 'nueva' means creating one. Held here rather than inside the
  // bar list because the button that opens it is now in the header, on
  // the month's line.
  const [editing, setEditing] = useState<Category | 'nueva' | null>(null)

  const data = useQuery({
    queryKey: ['beta', 'categorias', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [expenses, categories, household] = await Promise.all([
        session.db.listExpensesInMonth({
          householdId: id,
          monthStart,
          monthEnd,
        }),
        session.db.listCategories(id),
        session.db.getHousehold(id),
      ])
      return { expenses, categories, household }
    },
  })

  if (data.isPending) {
    return (
      <>
        <Title text="Categorías" sub={<NameSkel />} pager />
        <ListSkeleton label="Cargando las categorías" rows={6} />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Categorías" />
        <LoadFailed />
      </>
    )
  }

  const { expenses, categories, household } = data.data

  return (
    <>
      <Title
        text="Categorías"
        sub={`En qué se fue la plata de ${household.name} en ${monthName(monthStart)}, sin importar cómo se pagó. Están todas, también las que no usaron.`}
        pager
      />
      {/* Above the first category, not under the last one: it is how a
          category gets made, and the list it adds to can be long. */}
      <div className="rowend">
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => setEditing('nueva')}
        >
          <Plus />
          Nueva categoría
        </button>
      </div>
      {/* No ring here: Inicio already has it, and it answers a different
          question. That one says where the month went; these bars say how
          each category is doing against its own cap. */}
      <CategoryBars
        session={session}
        expenses={expenses}
        categories={categories}
        editing={editing}
        onEditing={setEditing}
      />
    </>
  )
}

// The bar list, not the ring: the ring says where the month went, this one
// says how each category is doing, which is why it measures against the
// cap when there is one.
function CategoryBars({
  session,
  expenses,
  categories,
  editing,
  onEditing,
}: {
  readonly session: BetaSession
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly editing: Category | 'nueva' | null
  readonly onEditing: (next: Category | 'nueva' | null) => void
}): ReactElement {
  // Every category the household has, not only the ones this month
  // touched: this screen is also where categories are managed, and a
  // category you cannot see is a category you cannot edit. The ones with
  // nothing in them sit at zero with an empty bar, which is the honest
  // picture of a month.
  //
  // Most spent first, and then the untouched ones by name, so the month
  // still reads top to bottom.
  const summary = summarizeByCategory({ expenses, categories })
  const found = (categoryId: string) =>
    summary.find((row) => row.categoryId === categoryId)
  const rows = categories
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      color: category.color,
      cap: category.monthlyBudget,
      total: found(category.id)?.total ?? 0,
      share: found(category.id)?.share ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'es'))
  const max = rows[0]?.total ?? 0

  return (
    <>
      <div className="sec">
        {rows.map((row) => {
          const cap = row.cap
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
              <button
                className="rowedit"
                type="button"
                aria-label={`Editar ${row.name}`}
                onClick={() => {
                  const found = categories.find(
                    (candidate) => candidate.id === row.categoryId,
                  )
                  if (found !== undefined) onEditing(found)
                }}
              >
                <Pencil />
              </button>
              <span className="bar">
                <i
                  style={{
                    width: `${String(width)}%`,
                    background: over ? 'var(--red-solid)' : row.color,
                  }}
                />
              </span>
              <span className={over ? 'sub over' : 'sub'}>
                {row.total === 0
                  ? cap > 0
                    ? `Todavía nada. El tope es ${formatCurrency(cap)}.`
                    : 'Todavía no gastaron nada acá.'
                  : cap > 0
                    ? over
                      ? `Se pasaron ${formatCurrency(row.total - cap)} del tope de ${formatCurrency(cap)}`
                      : `${formatCurrency(cap - row.total)} por debajo del tope de ${formatCurrency(cap)}`
                    : `${String(Math.round(row.share * 100))}% de lo que gastaron`}
              </span>
            </div>
          )
        })}
      </div>
      {editing === null ? null : (
        <CategoriaSheet
          open
          onClose={() => onEditing(null)}
          session={session}
          category={editing === 'nueva' ? null : editing}
          existing={categories}
          {...(editing === 'nueva'
            ? {}
            : {
                spentThisMonth:
                  rows.find((row) => row.categoryId === editing.id)?.total ?? 0,
              })}
        />
      )}
    </>
  )
}

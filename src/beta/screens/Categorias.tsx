import { useQuery } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { formatCurrency, summarizeByCategory } from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { useMonth } from '../MonthContext'
import { CategoryTile } from '../Tile'
import { monthName } from '../format'
import type { BetaSession } from '../data'
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
        sub={`En qué se fue la plata de ${household.name} en ${monthName(monthStart)}, sin importar cómo se pagó.`}
        pager
      />
      {/* No ring here: Inicio already has it, and it answers a different
          question. That one says where the month went; these bars say how
          each category is doing against its own cap. */}
      <CategoryBars expenses={expenses} categories={categories} />
    </>
  )
}

// The bar list, not the ring: the ring says where the month went, this one
// says how each category is doing, which is why it measures against the
// cap when there is one.
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

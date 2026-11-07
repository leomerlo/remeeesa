import { useQuery } from '@tanstack/react-query'
import { LineChart } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import {
  buildProjection,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import { pendientesDueInMonth } from '@/lib/pendientes'
import { cssVars } from '@/lib/cssVars'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { useMonth } from '../MonthContext'
import { CategoryTile } from '../Tile'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { ProyeccionSheet } from '../sheets/ProyeccionSheet'
import type { ProjectionRow } from '../sheets/ProyeccionSheet'
import { LoadFailed, Title } from './Gastos'

// Where a line's figure comes from, which is the one thing worth knowing
// about it. Same three the v1 draws, same meanings.
type Kind = 'cargado' | 'anterior' | 'servicio'

const BADGE: Readonly<Record<Kind, string>> = {
  cargado: 'Ya cargado',
  anterior: 'Del mes anterior',
  servicio: 'Servicio sin pagar',
}

export function Proyecciones({
  session,
}: {
  readonly session: BetaSession
}): ReactElement {
  const householdId = session.householdId ?? null
  // The line whose figure is being argued with. Null is the list as it
  // stands.
  const [editing, setEditing] = useState<ProjectionRow | null>(null)
  const { monthStart, monthEnd } = useMonth()
  const previousStart = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() - 1,
    1,
  )
  const previousEnd = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    0,
    23,
    59,
    59,
    999,
  )

  const data = useQuery({
    queryKey: ['beta', 'proyecciones', householdId, monthStart.toISOString()],
    enabled: householdId !== null,
    queryFn: async () => {
      const id = householdId as string
      const [current, previous, categories, pendientes, projection, household] =
        await Promise.all([
          session.db.listExpensesInMonth({
            householdId: id,
            monthStart,
            monthEnd,
          }),
          session.db.listExpensesInMonth({
            householdId: id,
            monthStart: previousStart,
            monthEnd: previousEnd,
          }),
          session.db.listCategories(id),
          session.db.listPendientes({ householdId: id }),
          session.db.getProjection({ householdId: id, monthStart }),
          session.db.getHousehold(id),
        ])
      return {
        current,
        previous,
        categories,
        pendientes,
        projection,
        household,
      }
    },
  })

  if (data.isPending) {
    return (
      <>
        <Title text="Proyección" sub={<NameSkel />} pager />
        <ListSkeleton label="Cargando la proyección" rows={5} />
      </>
    )
  }
  if (data.isError || data.data === undefined) {
    return (
      <>
        <Title text="Proyección" />
        <LoadFailed />
      </>
    )
  }

  const { current, previous, categories, pendientes, projection, household } =
    data.data
  const header = (
    <Title
      text="Proyección"
      sub={`Lo que ${household.name} ya lleva de ${monthName(monthStart)}, más lo que el mes pasado dice que falta.`}
      pager
    />
  )

  // Bills still owed in this month. Through countedByBudget like every
  // other peso figure: a card billed in dollars is due this month too, and
  // adding it in would make the total a number of nothing.
  const servicios = countedByBudget(
    pendientesDueInMonth(pendientes, monthStart, monthEnd).map((pendiente) => ({
      ...pendiente,
      currency: pendiente.currency ?? DEFAULT_CURRENCY,
    })),
  )

  const byId = new Map(categories.map((category) => [category.id, category]))
  const nameOf = (categoryId: string): string =>
    byId.get(categoryId)?.name ?? 'Sin categoría'
  const colorOf = (categoryId: string): string =>
    byId.get(categoryId)?.color ?? '#9aa0a6'

  const rows: readonly {
    key: string
    label: string
    kind: Kind
    color: string
    price: number
  }[] = [
    ...buildProjection(
      previous,
      current,
      servicios.map((servicio) => servicio.name),
    ).map((row) => ({
      key: row.categoryId,
      label: nameOf(row.categoryId),
      kind:
        row.source === 'actual' ? ('cargado' as const) : ('anterior' as const),
      color: colorOf(row.categoryId),
      price: row.price,
    })),
    ...servicios.map((pendiente) => ({
      key: `servicio-${pendiente.id}`,
      label: pendiente.name,
      kind: 'servicio' as const,
      color: colorOf(pendiente.categoryId),
      price: pendiente.expectedAmount ?? 0,
    })),
  ]
    // Biggest first, like every other list of amounts in this app: the
    // line worth arguing about is the one at the top.
    .slice()
    .sort((a, b) => b.price - a.price)

  if (rows.length === 0) {
    return (
      <>
        {header}
        <div className="card empty">
          <span className="orb" aria-hidden="true">
            <LineChart />
          </span>
          <h3>Todavía no hay nada para proyectar</h3>
          <p>
            Cuando haya gastos de un mes, acá van a ver cómo viene el siguiente.
          </p>
        </div>
      </>
    )
  }

  // The household's own edits to this month, read exactly as the v1 saved
  // them: rows switched off and amounts typed over the suggested ones. The
  // keys carry the month, so one month's scenario never bleeds into
  // another's.
  const monthKey = (key: string): string =>
    `${String(monthStart.getTime())}-${key}`
  const excluded = new Set(projection?.excluded ?? [])
  const overrides = projection?.overrides ?? {}
  const amountOf = (key: string, price: number): number => {
    const raw = overrides[monthKey(key)]
    if (raw === undefined) return price
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const total = rows.reduce(
    (sum, row) =>
      excluded.has(monthKey(row.key))
        ? sum
        : sum + amountOf(row.key, row.price),
    0,
  )
  const edited = rows.some(
    (row) =>
      excluded.has(monthKey(row.key)) ||
      overrides[monthKey(row.key)] !== undefined,
  )

  return (
    <>
      {header}
      <div className="card hero">
        <div className="label">
          Así viene {monthName(monthStart)} si todo sigue igual
        </div>
        <div className="figure">
          <Figure amount={total} />
        </div>
        <div className="legend">
          <span>
            Lo ya cargado del mes, más lo que el mes pasado dice que falta.
          </span>
        </div>
      </div>
      {edited ? (
        <div className="card alert alert-info">
          <span className="tile" aria-hidden="true">
            <LineChart />
          </span>
          <p>
            Hay líneas ajustadas a mano. Tocá cualquiera para cambiarla o para
            dejarla fuera del mes.
          </p>
        </div>
      ) : null}
      <div className="sec">
        {rows.map((row) => {
          const off = excluded.has(monthKey(row.key))
          const amount = amountOf(row.key, row.price)
          return (
            <button
              type="button"
              className={off ? 'card projrow off' : 'card projrow'}
              key={row.key}
              onClick={() =>
                setEditing({
                  key: row.key,
                  label: row.label,
                  price: row.price,
                })
              }
            >
              <CategoryTile name={row.label} color={row.color} />
              <span className="name">{row.label}</span>
              <span className="tag" style={cssVars({ '--pc': row.color })}>
                {BADGE[row.kind]}
              </span>
              <span className="amt">{formatCurrency(amount)}</span>
              {off ? (
                <span className="sub">No cuenta en el total</span>
              ) : overrides[monthKey(row.key)] === undefined ? null : (
                <span className="sub">
                  Lo pusieron a mano, en vez de {formatCurrency(row.price)}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <Compare current={current} categories={categories} />
      {editing === null ? null : (
        <ProyeccionSheet
          open
          onClose={() => setEditing(null)}
          session={session}
          row={editing}
          monthStart={monthStart}
          excluded={excluded}
          overrides={overrides}
        />
      )}
    </>
  )
}

// What the month has actually taken so far, beside the projection above it:
// the projection is a guess, and this is the part of it that already
// happened.
function Compare({
  current,
  categories,
}: {
  readonly current: Parameters<typeof summarizeByCategory>[0]['expenses']
  readonly categories: readonly Category[]
}): ReactElement | null {
  const rows = summarizeByCategory({ expenses: current, categories })
  const spent = rows.reduce((sum, row) => sum + row.total, 0)
  if (spent === 0) return null
  return (
    <div className="card quiet static">
      <span className="k">Ya llevan gastado</span>
      <span className="v">{formatCurrency(spent)} de esa proyección</span>
    </div>
  )
}

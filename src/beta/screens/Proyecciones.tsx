import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Info, LineChart } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  buildProjection,
  currentMonthRange,
  formatCurrency,
  summarizeByCategory,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import { pendientesDueInMonth } from '@/lib/pendientes'
import { cssVars } from '@/lib/cssVars'
import { ListSkeleton, NameSkel } from '../Skeleton'
import { Figure } from '../Figure'
import { MonthPager } from '../MonthPager'
import { CategoryTile } from '../Tile'
import { monthName } from '../format'
import type { BetaSession } from '../data'
import { AlertCard } from '../rows'
import { LoadFailed, Title } from './Gastos'

// The household's edits to one month: lines switched off, and amounts
// typed over the suggested ones. Carries the month they were made in, so
// paging to another one shows that month's saved scenario rather than
// this one's typing.
type Edits = {
  readonly monthTime: number
  readonly excluded: readonly string[]
  readonly overrides: Readonly<Record<string, string>>
}

// Long enough that a figure typed straight through goes up as one write,
// short enough that tapping away immediately still saves. The v1's.
const SAVE_DEBOUNCE_MS = 700

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
  const queryClient = useQueryClient()
  // What is on screen: whatever has been typed since the month loaded,
  // otherwise whatever the household has saved.
  const [edits, setEdits] = useState<Edits | null>(null)
  const saving = useMutation({
    mutationFn: (next: Edits) =>
      session.db.saveProjection({
        householdId: householdId ?? '',
        monthStart: new Date(next.monthTime),
        excluded: next.excluded,
        overrides: next.overrides,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['beta', 'proyecciones'] })
    },
  })
  // Typing in an amount fires a change per keystroke and each one is a
  // whole-document write. Held for a beat so a figure typed straight
  // through goes up once instead of six times.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const save = (next: Edits): void => {
    if (pending.current !== null) clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      saving.mutate(next)
    }, SAVE_DEBOUNCE_MS)
  }
  useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current)
    },
    [],
  )
  // Next month, not this one, and its own month rather than the app's.
  //
  // It read "cómo viene noviembre" while standing in November -- a useful
  // figure, but not what this screen is for: the point of a projection is
  // the month you can still do something about. So it opens on the month
  // ahead and pages from there, and stepping it leaves Inicio and Gastos
  // where they were, because they are about a month that has happened.
  const [anchor, setAnchor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth() + 1, 1)
  })
  const { monthStart, monthEnd } = currentMonthRange(anchor)
  const paging = (
    <MonthPager
      month={monthStart}
      onStep={(months) =>
        setAnchor(
          (current) =>
            new Date(current.getFullYear(), current.getMonth() + months, 1),
        )
      }
    />
  )
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
        <Title text="Proyección" sub={<NameSkel />} pager={paging} />
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
      sub={`Lo que ${monthName(monthStart)} le va a pedir a ${household.name}, según lo que viene gastando y los servicios que ya tiene.`}
      pager={paging}
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

  // The household's own edits to this month, read exactly as the v1 saves
  // them: rows switched off and amounts typed over the suggested ones. The
  // keys carry the month, so one month's scenario never bleeds into
  // another's.
  const monthKey = (key: string): string =>
    `${String(monthStart.getTime())}-${key}`
  const mine = edits?.monthTime === monthStart.getTime() ? edits : null
  const excluded = new Set(mine?.excluded ?? projection?.excluded ?? [])
  const overrides = mine?.overrides ?? projection?.overrides ?? {}
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
  const apply = (
    nextExcluded: ReadonlySet<string>,
    nextOverrides: Readonly<Record<string, string>>,
  ): void => {
    const next = {
      monthTime: monthStart.getTime(),
      excluded: [...nextExcluded],
      overrides: nextOverrides,
    }
    setEdits(next)
    save(next)
  }
  const toggle = (key: string, on: boolean): void => {
    const nextExcluded = new Set(excluded)
    if (on) nextExcluded.delete(monthKey(key))
    else nextExcluded.add(monthKey(key))
    apply(nextExcluded, overrides)
  }
  const type = (key: string, raw: string, price: number): void => {
    const nextOverrides: Record<string, string> = { ...overrides }
    // An amount typed back to the suggested one stops being an override:
    // left behind it would pin the line to a figure the next reading is
    // meant to move.
    if (raw.trim() === '' || Number(raw) === price)
      delete nextOverrides[monthKey(key)]
    else nextOverrides[monthKey(key)] = raw
    apply(excluded, nextOverrides)
  }

  return (
    <>
      {header}
      {/* Above everything, as the v1 has it, and in the v1's words: this
          screen is a scenario, and nothing else on it says so. */}
      <AlertCard kind="info" icon={<Info />}>
        Lo gastado en el mes por categoría, lo del mes anterior que todavía no
        apareció y los servicios pendientes. Editá un monto o apagá una fila
        para ver el total final.
      </AlertCard>
      <div className="card hero">
        <div className="label">
          Así se perfila {monthName(monthStart)} si todo sigue igual
        </div>
        <div className="figure">
          <Figure amount={total} />
        </div>
        <p className="herosay">
          Lo que ya anotaron de ese mes, más lo que el mes anterior dice que va
          a repetirse.
        </p>
      </div>
      {/* One card per line, with its switch and its amount on it -- the
          v1's shape. A sheet per line was one tap too many for a screen
          whose whole job is trying figures out. */}
      <div className="sec">
        {rows.map((row) => {
          const on = !excluded.has(monthKey(row.key))
          const typed = overrides[monthKey(row.key)]
          return (
            <div
              className={on ? 'card projcard' : 'card projcard off'}
              key={row.key}
            >
              <button
                type="button"
                role="switch"
                aria-checked={on}
                className="swrow projhead"
                aria-label={`Contar ${row.label} en ${monthName(monthStart)}`}
                onClick={() => toggle(row.key, !on)}
              >
                <CategoryTile name={row.label} color={row.color} />
                <span className="name">{row.label}</span>
                <span className="tag" style={cssVars({ '--pc': row.color })}>
                  {BADGE[row.kind]}
                </span>
                <span className="tg" aria-hidden="true">
                  <i />
                </span>
              </button>
              <div className="money-in">
                <span className="pre" aria-hidden="true">
                  $
                </span>
                <input
                  aria-label={`Cuánto va a ser ${row.label}`}
                  value={typed ?? String(row.price)}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  disabled={!on}
                  onChange={(event) =>
                    type(row.key, event.target.value, row.price)
                  }
                />
              </div>
              {on ? null : <span className="sub">No cuenta en el total</span>}
            </div>
          )
        })}
      </div>
      <Compare current={current} categories={categories} />
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

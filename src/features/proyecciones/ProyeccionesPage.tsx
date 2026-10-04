import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { AlertMessage } from '@/components/ui/alert-message'
import { TintedBadge } from '@/components/CategoryBadge'
import { cssVars } from '@/lib/cssVars'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import {
  colorForCategoryName,
  inkForCategoryColor,
} from '@/lib/expenses/categoryColor'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { projectionQueryKey } from './queryKeys'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Switch } from '@/components/ui/switch'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import {
  MonthPager,
  categoriesQueryKey,
  expensesInMonthQueryKey,
} from '@/features/expenses'
import {
  buildProjection,
  currentMonthRange,
  formatCurrency,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { countedByBudget, DEFAULT_CURRENCY } from '@/lib/money'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { cn } from '@/lib/utils'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

// Where a line's figure comes from, which is the one thing worth knowing
// about it: a real total, a guess carried from last month, or a bill that
// has not been paid yet. Each wears its own badge colour -- jade for what
// actually happened, amber for an estimate, blue for something known but
// still owed.
type ProjectionKind = 'cargado' | 'anterior' | 'servicio'

const KIND_BADGE: Readonly<
  Record<ProjectionKind, { readonly label: string; readonly color: string }>
> = {
  cargado: { label: 'Cargado', color: '#1c8478' },
  anterior: { label: 'Del mes anterior', color: '#d2771a' },
  servicio: { label: 'Servicio pendiente', color: '#29587c' },
}

// What the household has typed over the figures this screen suggests.
type ProjectionEdits = {
  readonly excluded: readonly string[]
  readonly overrides: Readonly<Record<string, string>>
}

// Edits carry the month they were made in, so paging to another month shows
// that month's saved projection rather than this one's typing. Derived from
// the state rather than cleared by an effect, which would be a render just
// to throw the last one away.
type MonthEdits = ProjectionEdits & { readonly monthTime: number }

// Long enough that a figure typed straight through goes up as one write,
// short enough that tapping away immediately still saves.
const SAVE_DEBOUNCE_MS = 700

export type ProyeccionesPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function ProyeccionesPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: ProyeccionesPageProps): ReactElement {
  const { currentUserId, db, membership } = useHouseholdMembership({
    ...(currentUserIdProp === undefined
      ? {}
      : { currentUserId: currentUserIdProp }),
    ...(householdsDb === undefined ? {} : { householdsDb }),
  })
  const householdId = membership?.householdId
  const queryClient = useQueryClient()
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const current = useMemo(() => currentMonthRange(viewedMonth), [viewedMonth])
  const previous = useMemo(
    () =>
      currentMonthRange(
        new Date(
          current.monthStart.getFullYear(),
          current.monthStart.getMonth() - 1,
          1,
        ),
      ),
    [current],
  )
  const query = (range: { monthStart: Date; monthEnd: Date }) => ({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId: householdId ?? '' }),
      range.monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({ db, householdId: householdId ?? '', ...range }),
    enabled: householdId !== undefined,
  })
  const currentQuery = useQuery(query(current))
  const previousQuery = useQuery(query(previous))
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId: householdId ?? '' }),
    queryFn: () => listCategories({ db, householdId: householdId ?? '' }),
    enabled: householdId !== undefined,
  })
  // Still-unpaid servicios due in the viewed month; once paid they are
  // already inside their category's total. Same key as the budget cards.
  const pendingQuery = useQuery({
    queryKey: [
      ...pendientesQueryKey({ householdId: householdId ?? '' }),
      'committed',
    ],
    queryFn: () => listPendientes({ db, householdId: householdId ?? '' }),
    enabled: householdId !== undefined,
  })
  // The household's hand edits to this month: rows switched off, and
  // amounts typed over the suggested ones. They used to be plain state, so
  // a scenario built over five minutes was gone the moment you tapped
  // another screen. They live in Firestore rather than on the device
  // because a projection is the *household's* -- per direct feedback, "es
  // una proyección de la casa" -- so Leo opening the same month sees what
  // Flor built, and the other way round.
  const projectionQuery = useQuery({
    queryKey: projectionQueryKey({
      householdId: householdId ?? '',
      monthStart: current.monthStart,
    }),
    queryFn: () =>
      db.getProjection({
        householdId: householdId ?? '',
        monthStart: current.monthStart,
      }),
    enabled: householdId !== undefined,
  })
  const saved = projectionQuery.data
  const [edits, setEdits] = useState<MonthEdits | null>(null)
  const editsForMonth =
    edits?.monthTime === current.monthStart.getTime() ? edits : null
  // What is on screen: whatever has been typed since the month loaded,
  // otherwise whatever is saved. Edits are cleared when the month changes,
  // so paging back and forth does not carry one month's scenario into
  // another's.
  const excluded = useMemo(
    () => new Set(editsForMonth?.excluded ?? saved?.excluded ?? []),
    [editsForMonth, saved],
  )
  const overrides = editsForMonth?.overrides ?? saved?.overrides ?? {}

  const saveMutation = useMutation({
    mutationFn: (next: ProjectionEdits) =>
      db.saveProjection({
        householdId: householdId ?? '',
        monthStart: current.monthStart,
        excluded: next.excluded,
        overrides: next.overrides,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: projectionQueryKey({
          householdId: householdId ?? '',
          monthStart: current.monthStart,
        }),
      })
    },
  })
  // Typing in an amount field fires a change per keystroke, and each one is
  // a whole-document write. Held for a beat so a figure typed straight
  // through goes up once instead of six times.
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const applyEdits = (next: ProjectionEdits): void => {
    setEdits({ ...next, monthTime: current.monthStart.getTime() })
    if (pendingSave.current !== null) {
      clearTimeout(pendingSave.current)
    }
    pendingSave.current = setTimeout(() => {
      saveMutation.mutate(next)
    }, SAVE_DEBOUNCE_MS)
  }
  useEffect(
    () => () => {
      if (pendingSave.current !== null) {
        clearTimeout(pendingSave.current)
      }
    },
    [],
  )
  const setExcluded = (
    update: (previous: ReadonlySet<string>) => ReadonlySet<string>,
  ): void => {
    applyEdits({ excluded: [...update(excluded)], overrides })
  }
  const setOverrides = (
    update: (
      previous: Readonly<Record<string, string>>,
    ) => Readonly<Record<string, string>>,
  ): void => {
    applyEdits({ excluded: [...excluded], overrides: update(overrides) })
  }

  const monthKey = (categoryId: string): string =>
    `${String(current.monthStart.getTime())}-${categoryId}`
  const header = <PageHeader title="Proyecciones" />

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <EmptyState
          illustration={ILLUSTRATIONS.protected}
          title="Todavía no hay nada para proyectar"
          description="Cuando haya gastos de un mes, acá vas a ver cómo viene el siguiente."

          action={
            <Button asChild>
              <Link to="/">Ir a Inicio</Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (
    currentQuery.data === undefined ||
    previousQuery.data === undefined ||
    categoriesQuery.data === undefined ||
    pendingQuery.data === undefined
  ) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  const names = new Map(categoriesQuery.data.map((c) => [c.id, c.name]))
  // Through countedByBudget like every other peso figure: the dollar
  // Resumen of a card billed in both currencies is due in this month too,
  // and without this it was listed as an editable peso amount and added
  // straight into the total. Found in the arithmetic audit -- the total
  // read $120 more than Home's "En uso" for exactly that reason.
  const servicios = countedByBudget(
    pendientesDueInMonth(
      pendingQuery.data,
      current.monthStart,
      current.monthEnd,
    ).map((pendiente) => ({
      ...pendiente,
      currency: pendiente.currency ?? DEFAULT_CURRENCY,
    })),
  )
  // Every line here is about a category, so every line wears that
  // category's own icon and colour -- the same pair it has on Categorías,
  // on a row in Histórico and on a card in Servicios. Per direct feedback.
  const categoryById = new Map(categoriesQuery.data.map((c) => [c.id, c]))
  const colorOf = (categoryId: string): string =>
    categoryById.get(categoryId)?.color ??
    colorForCategoryName(names.get(categoryId) ?? '')
  const rows: readonly {
    key: string
    label: string
    kind: ProjectionKind
    categoryName: string
    color: string
    price: number
  }[] = [
    ...buildProjection(
      previousQuery.data,
      currentQuery.data,
      servicios.map((s) => s.name),
    ).map((row) => {
      const categoryName = names.get(row.categoryId) ?? 'Sin categoría'
      return {
        key: row.categoryId,
        label: categoryName,
        kind:
          row.source === 'actual'
            ? ('cargado' as const)
            : ('anterior' as const),
        categoryName,
        color: colorOf(row.categoryId),
        price: row.price,
      }
    }),
    ...servicios.map((pendiente) => ({
      key: `servicio-${pendiente.id}`,
      label: pendiente.name,
      kind: 'servicio' as const,
      categoryName: names.get(pendiente.categoryId) ?? 'Sin categoría',
      color: colorOf(pendiente.categoryId),
      price: pendiente.expectedAmount ?? 0,
    })),
  ]
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

  return (
    <div className="flex w-full flex-col gap-8">
      {/* The same figure treatment Histórico's month total has: the label
          quiet, the number loud. As plain muted text beside the title it
          was the one thing on the screen everything else adds up to, and
          the easiest thing on it to miss. Per direct feedback. */}
      <PageHeader
        title="Proyecciones"
        trailing={
          <span className="money text-title text-foreground">
            {formatCurrency(total)}
          </span>
        }
      />
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
        maxMonthsAhead={1}
      />
      <AlertMessage tone="info">
        Lo gastado en el mes por categoría, lo del mes anterior que todavía no
        apareció y los servicios pendientes. Editá un monto o apagá una fila
        para ver el total final.
      </AlertMessage>
      {rows.length === 0 ? (
        <EmptyState
          illustration={ILLUSTRATIONS.protected}
          title="Todavía no hay nada para proyectar"
          description="Cargá gastos este mes o el anterior y van a aparecer acá."

          action={
            <Button asChild>
              <Link to="/">Ir a Inicio</Link>
            </Button>
          }
        />
      ) : (
        // A card each, two across on a monitor. As bare rows on one column
        // the toggle, the name and the field read as three unrelated
        // controls in a line rather than as one editable line of a
        // scenario. Per direct feedback.
        <ul
          aria-label="Categorías proyectadas"
          className="grid w-full grid-cols-1 gap-3 lg:grid-cols-2"
        >
          {rows.map((row) => {
            const included = !excluded.has(monthKey(row.key))
            return (
              <li
                key={row.key}
                className="bg-card card-surface flex flex-col gap-3 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      'flex min-w-0 flex-1 items-start gap-3',
                      !included && 'opacity-50',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
                      style={cssVars({
                        '--swatch-color': row.color,
                        '--swatch-ink': inkForCategoryColor(row.color),
                      })}
                    >
                      {(() => {
                        const Icon = iconForCategoryName(row.categoryName)
                        return (
                          <Icon
                            className="size-4 text-[var(--swatch-ink)]"
                            aria-hidden="true"
                          />
                        )
                      })()}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-foreground truncate font-bold">
                        {row.label}
                      </p>
                      {/* self-start, or the badge stretches to the column's
                          width: it is inline-block, but as a flex child it
                          takes the cross axis unless told not to. */}
                      <TintedBadge
                        className="self-start"
                        label={KIND_BADGE[row.kind].label}
                        color={KIND_BADGE[row.kind].color}
                      />
                    </div>
                  </div>
                  <Switch
                    aria-label={`Incluir ${row.label}`}
                    checked={included}
                    onCheckedChange={(checked) => {
                      setExcluded((prev) => {
                        const next = new Set(prev)
                        if (checked) next.delete(monthKey(row.key))
                        else next.add(monthKey(row.key))
                        return next
                      })
                    }}
                  />
                </div>
                {/* The "$" sits inside the field rather than beside it: this
                    is one amount being edited, not a label and a number. */}
                <div
                  className={cn('relative w-full', !included && 'opacity-50')}
                >
                  <span
                    aria-hidden="true"
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm"
                  >
                    $
                  </span>
                  <FormattedAmountInput
                    aria-label={`Monto de ${row.label}`}
                    className="w-full pl-8"
                    value={overrides[monthKey(row.key)] ?? String(row.price)}
                    onChange={(raw) => {
                      setOverrides((prev) => ({
                        ...prev,
                        [monthKey(row.key)]: raw,
                      }))
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

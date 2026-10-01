import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
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
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { cn } from '@/lib/utils'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'

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
  // Rows switched off, by month-scoped key: left out of the total so a
  // scenario can be weighed without deleting anything.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  // Edited amounts by month and row, as the raw string the input holds; rows not in
  // here show their own price. Not persisted: a projection is a scratchpad.
  const [overrides, setOverrides] = useState<Readonly<Record<string, string>>>(
    {},
  )

  const monthKey = (categoryId: string): string =>
    `${String(current.monthStart.getTime())}-${categoryId}`
  const header = <PageHeader title="Proyecciones" />

  if (currentUserId === null || membership === null) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <EmptyState
          illustration={ILLUSTRATIONS.counting}
          title="Todavía no hay nada para proyectar"
          description="Cuando haya gastos de un mes, acá vas a ver cómo viene el siguiente."
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
  const servicios = pendientesDueInMonth(
    pendingQuery.data,
    current.monthStart,
    current.monthEnd,
  )
  const rows: readonly {
    key: string
    label: string
    caption: string
    price: number
  }[] = [
    ...buildProjection(
      previousQuery.data,
      currentQuery.data,
      servicios.map((s) => s.name),
    ).map((row) => ({
      key: row.categoryId,
      label: names.get(row.categoryId) ?? 'Sin categoría',
      caption: row.source === 'actual' ? 'Cargado' : 'Del mes anterior',
      price: row.price,
    })),
    ...servicios.map((pendiente) => ({
      key: `servicio-${pendiente.id}`,
      label: pendiente.name,
      caption: 'Servicio pendiente',
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
      <PageHeader title="Proyecciones" trailing={formatCurrency(total)} />
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
        maxMonthsAhead={1}
      />
      <p className="text-muted-foreground text-sm">
        Lo gastado en el mes por categoría, lo del mes anterior que todavía no
        apareció y los servicios pendientes. Editá un monto o apagá una fila
        para ver el total final.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          illustration={ILLUSTRATIONS.counting}
          title="Todavía no hay nada para proyectar"
          description="Cargá gastos este mes o el anterior y van a aparecer acá."
        />
      ) : (
        <ul aria-label="Categorías proyectadas" className="flex flex-col gap-3">
          {rows.map((row) => {
            const included = !excluded.has(monthKey(row.key))
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3"
              >
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
                <div
                  className={cn('min-w-0 flex-1', !included && 'opacity-50')}
                >
                  <p className="truncate font-medium">{row.label}</p>
                  <p className="text-muted-foreground text-xs">{row.caption}</p>
                </div>
                <FormattedAmountInput
                  aria-label={`Monto de ${row.label}`}
                  className={cn('w-32 text-right', !included && 'opacity-50')}
                  value={overrides[monthKey(row.key)] ?? String(row.price)}
                  onChange={(raw) => {
                    setOverrides((prev) => ({
                      ...prev,
                      [monthKey(row.key)]: raw,
                    }))
                  }}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

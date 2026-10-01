import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
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
  // Edited amounts by month and category, as the raw string the input holds; rows not in
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
    categoriesQuery.data === undefined
  ) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  const names = new Map(categoriesQuery.data.map((c) => [c.id, c.name]))
  const rows = buildProjection(previousQuery.data, currentQuery.data)
  const amountOf = (key: string, price: number): number => {
    const raw = overrides[monthKey(key)]
    if (raw === undefined) return price
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const total = rows.reduce(
    (sum, row) => sum + amountOf(row.categoryId, row.price),
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
        Lo gastado en el mes por categoría, más lo del mes anterior que todavía
        no apareció. Editá cualquier monto para ver el total final.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          illustration={ILLUSTRATIONS.counting}
          title="Todavía no hay nada para proyectar"
          description="Cargá gastos este mes o el anterior y van a aparecer acá."
        />
      ) : (
        <ul aria-label="Categorías proyectadas" className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.categoryId}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {names.get(row.categoryId) ?? 'Sin categoría'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {row.source === 'actual' ? 'Cargado' : 'Del mes anterior'}
                </p>
              </div>
              <FormattedAmountInput
                aria-label={`Monto de ${names.get(row.categoryId) ?? 'Sin categoría'}`}
                className="w-32 text-right"
                value={overrides[monthKey(row.categoryId)] ?? String(row.price)}
                onChange={(raw) => {
                  setOverrides((prev) => ({
                    ...prev,
                    [monthKey(row.categoryId)]: raw,
                  }))
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

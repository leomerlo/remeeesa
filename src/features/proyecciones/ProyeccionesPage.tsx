import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { expensesInMonthQueryKey } from '@/features/expenses'
import {
  buildProjection,
  currentMonthRange,
  formatCurrency,
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
  const current = useMemo(() => currentMonthRange(), [])
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
  // Edited amounts by row key, as the raw string the input holds; rows not in
  // here show their own price. Not persisted: a projection is a scratchpad.
  const [overrides, setOverrides] = useState<Readonly<Record<string, string>>>(
    {},
  )

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

  if (currentQuery.data === undefined || previousQuery.data === undefined) {
    return (
      <div className="flex w-full flex-col gap-8">
        {header}
        <LoadingIndicator />
      </div>
    )
  }

  const rows = buildProjection(previousQuery.data, currentQuery.data)
  const amountOf = (key: string, price: number): number => {
    const raw = overrides[key]
    if (raw === undefined) return price
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
  }
  const total = rows.reduce((sum, row) => sum + amountOf(row.key, row.price), 0)

  return (
    <div className="flex w-full flex-col gap-8">
      <PageHeader title="Proyecciones" trailing={formatCurrency(total)} />
      <p className="text-muted-foreground text-sm">
        Lo que ya cargaste este mes, más lo del mes pasado que todavía no
        apareció. Editá cualquier monto para ver el total final.
      </p>
      {rows.length === 0 ? (
        <EmptyState
          illustration={ILLUSTRATIONS.counting}
          title="Todavía no hay nada para proyectar"
          description="Cargá gastos este mes o el anterior y van a aparecer acá."
        />
      ) : (
        <ul aria-label="Gastos proyectados" className="flex flex-col gap-3">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="text-muted-foreground text-xs">
                  {row.source === 'actual' ? 'Ya cargado' : 'Del mes pasado'}
                </p>
              </div>
              <FormattedAmountInput
                aria-label={`Monto de ${row.name}`}
                className="w-32 text-right"
                value={overrides[row.key] ?? String(row.price)}
                onChange={(raw) => {
                  setOverrides((prev) => ({ ...prev, [row.key]: raw }))
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

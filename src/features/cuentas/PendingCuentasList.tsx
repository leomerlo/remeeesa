import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { listPendingCuentas } from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { cuentasQueryKey } from './queryKeys'

export type PendingCuentasListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditCuenta?: (cuenta: Cuenta, categoryName: string) => void
  readonly onMarkPaid?: (cuenta: Cuenta) => void
}

export function PendingCuentasList({
  db,
  householdId,
  onEditCuenta,
  onMarkPaid,
}: PendingCuentasListProps): ReactElement {
  const cuentasQuery = useQuery({
    queryKey: cuentasQueryKey({ householdId }),
    queryFn: async () => {
      const [cuentas, categories] = await Promise.all([
        listPendingCuentas({ db, householdId }),
        listCategories({ db, householdId }),
      ])
      return { cuentas, categories }
    },
  })

  if (cuentasQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (cuentasQuery.isError) {
    const message =
      cuentasQuery.error instanceof Error
        ? cuentasQuery.error.message
        : 'No se pudieron cargar las cuentas'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const { cuentas, categories } = cuentasQuery.data
  if (cuentas.length === 0) {
    return (
      <p role="status" className="text-sm font-medium">
        No hay cuentas pendientes
      </p>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <ul
      aria-label="Cuentas pendientes"
      className="flex w-full flex-col gap-8 text-sm"
    >
      {cuentas.map((cuenta) => {
        const category = categoryById.get(cuenta.categoryId)
        const categoryName = category?.name ?? 'Categoría desconocida'
        const categoryColor =
          category?.color ?? colorForCategoryName(categoryName)

        const rowContent = (
          <>
            <span
              aria-hidden="true"
              className="size-10 shrink-0 rounded-full"
              style={{ backgroundColor: categoryColor }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-foreground font-medium">
                  {cuenta.name}
                </span>
                {cuenta.expectedAmount !== null ? (
                  <span className="font-display text-lg text-foreground">
                    {formatBudgetAmount(cuenta.expectedAmount)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                <span>{categoryName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatShortDate(cuenta.dueDate)}</span>
              </div>
            </div>
          </>
        )

        if (onEditCuenta === undefined && onMarkPaid === undefined) {
          return (
            <li key={cuenta.id}>
              <div className="bg-card shadow-resting flex items-center gap-3 rounded-2xl p-4">
                {rowContent}
              </div>
            </li>
          )
        }

        return (
          <li key={cuenta.id}>
            <div className="bg-card shadow-resting flex items-center gap-3 rounded-2xl p-4">
              {onEditCuenta !== undefined ? (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left transition-transform active:scale-[0.98]"
                  aria-label={`Editar ${cuenta.name}`}
                  onClick={() => {
                    onEditCuenta(cuenta, category?.name ?? '')
                  }}
                >
                  {rowContent}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {rowContent}
                </div>
              )}
              {onMarkPaid !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  aria-label={`Marcar pagada ${cuenta.name}`}
                  onClick={() => {
                    onMarkPaid(cuenta)
                  }}
                >
                  Pagar
                </Button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

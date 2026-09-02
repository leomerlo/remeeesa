import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { listPendientes } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { EmptyExpensesIllustration } from '@/features/expenses'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type PendientesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditPendiente?: (
    pendiente: Pendiente,
    categoryName: string,
  ) => void
  readonly onMarkPaid?: (pendiente: Pendiente) => void
}

export function PendientesList({
  db,
  householdId,
  onEditPendiente,
  onMarkPaid,
}: PendientesListProps): ReactElement {
  const pendientesQuery = useQuery({
    queryKey: pendientesQueryKey({ householdId }),
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientes({ db, householdId }),
        listCategories({ db, householdId }),
      ])
      return { pendientes, categories }
    },
  })

  if (pendientesQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (pendientesQuery.isError) {
    const message =
      pendientesQuery.error instanceof Error
        ? pendientesQuery.error.message
        : 'No se pudieron cargar los pendientes'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const { pendientes, categories } = pendientesQuery.data
  if (pendientes.length === 0) {
    // The mascot-with-notepad illustration every other empty state on the
    // app uses (Home's movements list, Histórico) -- plain text here was the
    // one empty state with no illustration at all.
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          No hay pendientes
        </p>
      </div>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <ul aria-label="Pendientes" className="flex w-full flex-col gap-3 text-sm">
      {pendientes.map((pendiente) => {
        const category = categoryById.get(pendiente.categoryId)
        const categoryName = category?.name ?? 'Categoría desconocida'
        const categoryColor =
          category?.color ?? colorForCategoryName(categoryName)

        const CategoryIcon = iconForCategoryName(categoryName)

        const rowContent = (
          <>
            <span
              aria-hidden="true"
              data-testid="category-icon"
              className="flex size-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: categoryColor }}
            >
              <CategoryIcon className="size-5 text-white" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-foreground font-medium">
                  {pendiente.name}
                </span>
                {pendiente.expectedAmount !== null ? (
                  <span className="font-display text-lg text-foreground">
                    {formatBudgetAmount(pendiente.expectedAmount)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                <span>{categoryName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatShortDate(pendiente.dueDate)}</span>
              </div>
            </div>
          </>
        )

        // "Pagar" sits on its own row rather than beside the amount. Sharing
        // one line with the name and the amount left names like "Expensas"
        // truncated to "Expen…" at 375px, and squeezed the button into a
        // flattened oval.
        return (
          <li key={pendiente.id}>
            <div className="bg-card shadow-resting flex flex-col gap-3 rounded-2xl p-4">
              {onEditPendiente !== undefined ? (
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-3 text-left transition-transform active:scale-[0.98]"
                  aria-label={`Editar ${pendiente.name}`}
                  onClick={() => {
                    onEditPendiente(pendiente, category?.name ?? '')
                  }}
                >
                  {rowContent}
                </button>
              ) : (
                <div className="flex w-full min-w-0 items-center gap-3">
                  {rowContent}
                </div>
              )}
              {onMarkPaid !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  aria-label={`Marcar pagado ${pendiente.name}`}
                  onClick={() => {
                    onMarkPaid(pendiente)
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

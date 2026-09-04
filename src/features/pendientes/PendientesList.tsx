import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { listPendientes } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { EmptyExpensesIllustration } from '@/features/expenses'
import { formatBudgetAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'
import { AlertMessage } from '@/components/ui/alert-message'

export type PendientesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditPendiente?: (
    pendiente: Pendiente,
    categoryName: string,
  ) => void
  readonly onMarkPaid?: (pendiente: Pendiente, categoryName: string) => void
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
      <div
        role="status"
        aria-label="Cargando…"
        className="flex w-full flex-col gap-3 text-sm"
      >
        <span className="sr-only">Cargando…</span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-card shadow-resting flex flex-col gap-3 rounded-2xl p-4"
          >
            <div className="flex w-full items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (pendientesQuery.isError) {
    const message =
      pendientesQuery.error instanceof Error
        ? pendientesQuery.error.message
        : 'No se pudieron cargar los pendientes'
    return <AlertMessage>{message}</AlertMessage>
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
                ) : pendiente.recurring ? (
                  // A recurring bill with no amount yet reads as
                  // incomplete/broken with nothing where a price usually
                  // is -- a placeholder says "not filled in yet" instead of
                  // looking like a rendering bug. A one-off Pendiente with
                  // no amount is a different, deliberate case (see
                  // AddPendienteForm's "Monto esperado" comment) and stays
                  // blank.
                  <span className="font-display text-muted-foreground text-lg">
                    $ --,--
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

        // Both actions are spelled out on their own row under the name.
        // "Editar" used to be the whole row being secretly tappable, which
        // is not an affordance anyone can see; and "Pagar" carried the same
        // weight as everything else on the card. Per direct feedback: the
        // two actions are Pagar and Editar, and Pagar is the primary one.
        // They sit under the name rather than beside the amount because
        // sharing that line truncated names like "Expensas" to "Expen…" at
        // 375px.
        const actions =
          onMarkPaid === undefined && onEditPendiente === undefined ? null : (
            <div className="flex gap-2 lg:justify-end">
              {onMarkPaid !== undefined ? (
                <Button
                  type="button"
                  className="flex-1 lg:w-32 lg:flex-none"
                  aria-label={`Marcar pagado ${pendiente.name}`}
                  onClick={() => {
                    onMarkPaid(pendiente, category?.name ?? '')
                  }}
                >
                  Pagar
                </Button>
              ) : null}
              {onEditPendiente !== undefined ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 lg:w-32 lg:flex-none"
                  aria-label={`Editar ${pendiente.name}`}
                  onClick={() => {
                    onEditPendiente(pendiente, category?.name ?? '')
                  }}
                >
                  Editar
                </Button>
              ) : null}
            </div>
          )

        return (
          <li key={pendiente.id}>
            <div className="bg-card shadow-resting flex flex-col gap-3 rounded-2xl p-4">
              <div className="flex w-full min-w-0 items-center gap-3">
                {rowContent}
              </div>
              {actions}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

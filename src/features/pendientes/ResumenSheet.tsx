import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { listResumenCuotas } from '@/lib/cards'
import {
  formatBudgetAmount,
  formatCurrency,
  listCategories,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatDate, formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { pendientesQueryKey } from './queryKeys'

export type ResumenSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // null keeps the sheet closed.
  readonly resumen: Pendiente | null
  readonly onClose: () => void
}

// A card's Resumen, opened: the cuotas it adds up. Read-only -- paying it is
// its own flow.
export function ResumenSheet({
  db,
  householdId,
  resumen,
  onClose,
}: ResumenSheetProps): ReactElement {
  return (
    <Sheet
      open={resumen !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
      title={resumen === null ? 'Resumen' : `Resumen ${resumen.name}`}
    >
      {resumen === null ? null : (
        <ResumenDetail db={db} householdId={householdId} resumen={resumen} />
      )}
    </Sheet>
  )
}

function ResumenDetail({
  db,
  householdId,
  resumen,
}: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumen: Pendiente
}): ReactElement {
  // Under the pendientes prefix, so a purchase that changes the Resumen
  // refreshes this too.
  const cuotasQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'resumen', resumen.id],
    queryFn: async () => {
      const [cuotas, categories] = await Promise.all([
        listResumenCuotas({ db, householdId, resumen }),
        listCategories({ db, householdId }),
      ])
      return { cuotas, categories }
    },
  })

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold">{resumen.name}</h2>
        <p className="text-muted-foreground text-sm">
          {formatMonthLabel(resumen.dueDate)} · Vence el{' '}
          {formatDate(resumen.dueDate)}
        </p>
        <span className="font-display text-foreground text-2xl">
          {formatBudgetAmount(resumen.expectedAmount ?? 0)}
        </span>
      </div>
      {cuotasQuery.isPending ? (
        <div
          role="status"
          aria-label="Cargando…"
          className="flex flex-col gap-3"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : cuotasQuery.isError ? (
        <AlertMessage>
          {cuotasQuery.error instanceof Error
            ? cuotasQuery.error.message
            : 'No se pudieron cargar las cuotas'}
        </AlertMessage>
      ) : (
        <ul aria-label="Cuotas del resumen" className="flex flex-col gap-3">
          {cuotasQuery.data.cuotas.map(({ purchase, cuota }) => {
            const category = cuotasQuery.data.categories.find(
              (candidate) => candidate.id === purchase.categoryId,
            )
            const categoryName = category?.name ?? 'Categoría desconocida'
            return (
              <li
                key={purchase.id}
                className="bg-muted/50 flex items-center justify-between gap-3 rounded-2xl p-3 text-sm"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-foreground truncate font-medium">
                    {purchase.name}
                  </span>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <CategoryBadge
                      name={categoryName}
                      color={
                        category?.color ?? colorForCategoryName(categoryName)
                      }
                    />
                    <span>{formatDate(purchase.purchaseDate)}</span>
                    {purchase.cuotas === 1 ? null : (
                      <span>{`cuota ${String(cuota.number)}/${String(purchase.cuotas)}`}</span>
                    )}
                  </div>
                </div>
                <span className="font-display text-foreground shrink-0 text-lg">
                  {formatCurrency(cuota.amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

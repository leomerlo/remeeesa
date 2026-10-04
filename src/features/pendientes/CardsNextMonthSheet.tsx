import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { listResumenCuotas } from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import { formatAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatDate, formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { pendientesQueryKey } from './queryKeys'

export type CardsNextMonthSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Next month's card bills, in the order the figure adds them up.
  readonly resumenes: readonly Pendiente[]
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

// What "Tarjetas el mes que viene" is made of: every consumo logged on a
// card whose cuota lands in that month, under the bill it will arrive in.
//
// Read-only on purpose. It is an estimate of bills that have not arrived --
// nothing here can be paid, edited or ticked off, and the figures are the
// household's own record rather than anything a card has said. Per direct
// feedback: algo de solo informativo.
export function CardsNextMonthSheet({
  db,
  householdId,
  resumenes,
  open,
  onOpenChange,
}: CardsNextMonthSheetProps): ReactElement {
  const detail = useQuery({
    queryKey: [
      ...pendientesQueryKey({ householdId }),
      'next-month-cuotas',
      resumenes.map((resumen) => resumen.id).join(','),
    ],
    queryFn: async () => {
      const [categories, ...perResumen] = await Promise.all([
        listCategories({ db, householdId }),
        ...resumenes.map((resumen) =>
          listResumenCuotas({ db, householdId, resumen }),
        ),
      ])
      return { categories, perResumen }
    },
    enabled: open,
  })

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Tarjetas el mes que viene"
    >
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain">
        <p className="text-muted-foreground text-sm">
          Lo que fuiste cargando con cada tarjeta y cae en el resumen del mes
          que viene. Es una estimación: la cuenta real la cargás cuando te llega
          el resumen.
        </p>
        {detail.isPending ? (
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
        ) : detail.isError ? (
          <AlertMessage>
            {detail.error instanceof Error
              ? detail.error.message
              : 'No se pudieron cargar los consumos'}
          </AlertMessage>
        ) : (
          resumenes.map((resumen, index) => (
            <section
              key={resumen.id}
              aria-label={`${resumen.name} de ${formatMonthLabel(resumen.dueDate)}`}
              className="flex flex-col gap-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-foreground font-semibold">
                  {resumen.name}
                </span>
                <span className="money text-foreground text-lg">
                  {formatAmount(
                    resumen.expectedAmount ?? resumen.estimatedAmount ?? 0,
                    resumen.currency ?? 'ARS',
                  )}
                </span>
              </div>
              <ul
                aria-label={`Consumos de ${resumen.name}`}
                className="flex flex-col gap-3"
              >
                {(detail.data.perResumen[index] ?? []).map(
                  ({ purchase, cuota }: ResumenCuota) => {
                    const category = detail.data.categories.find(
                      (candidate) => candidate.id === purchase.categoryId,
                    )
                    const categoryName =
                      category?.name ?? 'Categoría desconocida'
                    return (
                      <li
                        key={`${purchase.id}-${String(cuota.number)}`}
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
                                category?.color ??
                                colorForCategoryName(categoryName)
                              }
                            />
                            <span>{formatDate(purchase.purchaseDate)}</span>
                            {purchase.cuotas === 1 ? null : (
                              <span>{`cuota ${String(cuota.number)}/${String(purchase.cuotas)}`}</span>
                            )}
                          </div>
                        </div>
                        <span className="money text-foreground shrink-0 text-lg">
                          {formatAmount(cuota.amount, purchase.currency)}
                        </span>
                      </li>
                    )
                  },
                )}
              </ul>
            </section>
          ))
        )}
      </div>
    </Sheet>
  )
}

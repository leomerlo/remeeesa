import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Sheet, SheetScrollArea } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { listResumenCuotas } from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import { formatAmount, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatDate, formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { pendientesQueryKey } from './queryKeys'

// What to say under a card whose statement has already been loaded by
// hand. Same shape as the Resumen's own detail: the bill, then how far the
// household's own record was from it.
function resumenLoadedLine(resumen: Pendiente, estimated: number): string {
  const currency = resumen.currency ?? 'ARS'
  const expected = resumen.expectedAmount ?? 0
  const difference = Math.round(expected * 100 - estimated * 100) / 100
  const loaded = `Resumen cargado: ${formatAmount(expected, currency)}`
  return difference === 0
    ? `${loaded} · igual a lo que cargaste.`
    : `${loaded} · ${formatAmount(Math.abs(difference), currency)} ${difference > 0 ? 'más' : 'menos'} de lo que cargaste.`
}

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
      <SheetScrollArea>
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
          resumenes.map((resumen, index) => {
            const cuotas = detail.data.perResumen[index] ?? []
            // Added up from the movements listed right below it, not read
            // off the Resumen's stored total: this figure's whole job is to
            // be what that list comes to, so it is computed from the list.
            const estimated =
              cuotas.reduce(
                (cents, { cuota }) => cents + Math.round(cuota.amount * 100),
                0,
              ) / 100
            return (
              <section
                key={resumen.id}
                aria-label={`${resumen.name} de ${formatMonthLabel(resumen.dueDate)}`}
                className="flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-foreground font-semibold">
                    {resumen.name}
                  </span>
                  {/* The estimate -- which is what every row below it adds
                    up to. It used to show the bill once one had been
                    loaded by hand, so the figure and its own movements
                    disagreed. Per direct feedback. */}
                  <span className="money text-foreground text-lg">
                    {formatAmount(estimated, resumen.currency ?? 'ARS')}
                  </span>
                </div>
                {/* Said rather than substituted: the household loaded this
                  one by hand, and the gap between it and the estimate is
                  the thing worth seeing. Per direct feedback -- la
                  diferencia se muestra y nada más. */}
                {resumen.expectedAmount === null ? null : (
                  <p className="text-muted-foreground text-xs">
                    {resumenLoadedLine(resumen, estimated)}
                  </p>
                )}
                <ul
                  aria-label={`Consumos de ${resumen.name}`}
                  className="flex flex-col gap-3"
                >
                  {cuotas.map(({ purchase, cuota }: ResumenCuota) => {
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
                  })}
                </ul>
              </section>
            )
          })
        )}
      </SheetScrollArea>
    </Sheet>
  )
}

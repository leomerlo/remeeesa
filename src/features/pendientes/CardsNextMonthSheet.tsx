import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Sheet, SheetScrollArea } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { listResumenCuotas } from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import { formatAmount, listCategories } from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { ConsumoRow } from './ConsumoRow'
import { pendientesQueryKey } from './queryKeys'

// What to say under a card that has already been settled. Same shape as
// the Resumen's own detail: what was paid, then how far the household's own
// record was from it.
function resumenLoadedLine(resumen: Pendiente, estimated: number): string {
  const currency = resumen.currency ?? 'ARS'
  const expected = resumen.expectedAmount ?? 0
  const difference = Math.round(expected * 100 - estimated * 100) / 100
  const loaded = `Pagaste ${formatAmount(expected, currency)}`
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
  // Offered per card when these bills belong to the month on screen, which
  // is the only case where paying one makes sense. Home's "el mes que
  // viene" leaves it out: that month has not started.
  readonly onPay?: (resumen: Pendiente) => void
  // Names the set on the screen it was opened from: Home's is next
  // month's, Servicios' is the month on screen.
  readonly title?: string
}

// What "Tarjetas el mes que viene" is made of: every consumo logged on a
// card whose cuota lands in that month, under the bill it will arrive in.
//
// Nothing here can be paid or ticked off: it is an estimate of bills that
// have not arrived, and the figures are the household's own record rather
// than anything a card has said. Per direct feedback: algo de solo
// informativo.
//
// A consumo can still be deleted, because a wrong one has to be removable
// somewhere and this is where it is on screen. That is not paying a bill;
// it is taking back something the household logged.
export function CardsNextMonthSheet({
  db,
  householdId,
  resumenes,
  open,
  onOpenChange,
  onPay,
  title = 'Tarjetas el mes que viene',
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
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <SheetScrollArea>
        <p className="text-muted-foreground text-sm">
          Lo que fuiste cargando con cada tarjeta. Siempre es una estimación: el
          monto real lo ponés cuando pagás, porque ahí le sumás los impuestos e
          intereses del banco.
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
                {resumen.status !== 'paid' ||
                resumen.expectedAmount === null ? null : (
                  <p className="text-muted-foreground text-xs">
                    {resumenLoadedLine(resumen, estimated)}
                  </p>
                )}
                <ul
                  aria-label={`Consumos de ${resumen.name}`}
                  className="flex flex-col gap-3"
                >
                  {cuotas.map((consumo: ResumenCuota) => (
                    <ConsumoRow
                      key={`${consumo.purchase.id}-${String(consumo.cuota.number)}`}
                      db={db}
                      householdId={householdId}
                      consumo={consumo}
                      categories={detail.data.categories}
                    />
                  ))}
                </ul>
                {onPay === undefined ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      onPay(resumen)
                    }}
                  >
                    {`Pagar ${resumen.name}`}
                  </Button>
                )}
              </section>
            )
          })
        )}
      </SheetScrollArea>
    </Sheet>
  )
}

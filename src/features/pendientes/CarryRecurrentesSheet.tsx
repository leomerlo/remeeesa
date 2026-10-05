import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Repeat } from 'lucide-react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Sheet, SheetFooter, SheetScrollArea } from '@/components/ui/sheet'
import { formatAmount } from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { carryRecurrentes, listRecurrentesToCarry } from '@/lib/pendientes'
import { pendientesQueryKey } from './queryKeys'

export type CarryRecurrentesSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // The month being viewed -- bills come in from the month before it.
  readonly monthStart: Date
}

// "Traer del mes pasado": last month's recurring bills as a checklist,
// copied into the viewed month only when a member picks them. Nothing
// carries over on its own any more -- per direct feedback, doing it
// automatically on every payment left bills doubled.
//
// It used to be called "Pasar recurrentes", which assumed you already knew
// what a recurrente was and said nothing about where it was passing them
// from or to. Per direct feedback: the label now names the thing being
// done, in the words someone would use for it.
export function CarryRecurrentesSheet({
  db,
  householdId,
  monthStart,
}: CarryRecurrentesSheetProps): ReactElement {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-12 shrink-0 rounded-full lg:size-auto lg:gap-2 lg:px-4.5 lg:py-1.5"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Repeat aria-hidden="true" />
        <span className="sr-only lg:not-sr-only">Traer del mes pasado</span>
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Traer servicios del mes pasado"
      >
        <CarryRecurrentesForm
          db={db}
          householdId={householdId}
          monthStart={monthStart}
          onDone={() => {
            setOpen(false)
          }}
        />
      </Sheet>
    </>
  )
}

function CarryRecurrentesForm({
  db,
  householdId,
  monthStart,
  onDone,
}: CarryRecurrentesSheetProps & {
  readonly onDone: () => void
}): ReactElement {
  const queryClient = useQueryClient()
  const rowsQuery = useQuery({
    queryKey: [
      ...pendientesQueryKey({ householdId }),
      'to-carry',
      monthStart.getTime(),
    ],
    queryFn: () => listRecurrentesToCarry({ db, householdId, monthStart }),
  })
  // Which ones were *unticked*: every bill starts ticked, since most of them
  // come back every month, and this needs no syncing once the rows load.
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const mutation = useMutation({
    mutationFn: (
      pendientes: Parameters<typeof carryRecurrentes>[0]['pendientes'],
    ) => carryRecurrentes({ db, householdId, pendientes }),
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: pendientesQueryKey({ householdId }),
      })
    },
    onSuccess: onDone,
  })

  const rows = rowsQuery.data ?? []
  const picked = rows
    .filter((row) => !row.alreadyThere && !unticked.has(row.pendiente.id))
    .map((row) => row.pendiente)
  const previousMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() - 1,
    1,
  )

  function toggle(id: string): void {
    setUnticked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) {
        next.add(id)
      }
      return next
    })
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    mutation.mutate(picked)
  }

  return (
    <form
      className="flex h-full min-h-0 w-full flex-col"
      noValidate
      onSubmit={onSubmit}
    >
      <SheetScrollArea className="gap-4">
        <div className="flex flex-col gap-1">
          {/* No heading: the Sheet's header row already carries this exact
              title. */}
          <p className="text-muted-foreground text-sm">
            Elegí cuáles de {formatMonthLabel(previousMonth)} se repiten en{' '}
            {formatMonthLabel(monthStart)}.
          </p>
        </div>

        {rowsQuery.isPending ? (
          <LoadingIndicator compact />
        ) : rowsQuery.isError ? (
          <AlertMessage>
            No se pudieron cargar los servicios del mes pasado
          </AlertMessage>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay servicios que se repitan en {formatMonthLabel(previousMonth)}
            .
          </p>
        ) : (
          <ul aria-label="Servicios del mes pasado" className="flex flex-col">
            {rows.map(({ pendiente, alreadyThere }) => (
              <li key={pendiente.id}>
                <label
                  className={`flex min-h-11 items-center gap-3 py-2 ${alreadyThere ? 'text-muted-foreground' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="accent-primary size-5 shrink-0"
                    checked={alreadyThere || !unticked.has(pendiente.id)}
                    disabled={alreadyThere || mutation.isPending}
                    onChange={() => {
                      toggle(pendiente.id)
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {pendiente.name}
                  </span>
                  <span className="shrink-0 text-sm">
                    {alreadyThere
                      ? 'Ya está'
                      : pendiente.expectedAmount === null
                        ? null
                        : formatAmount(
                            pendiente.expectedAmount,
                            pendiente.currency ?? 'ARS',
                          )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {mutation.isError ? (
          <AlertMessage>
            No se pudieron pasar todos. Los que sí pasaron figuran como «Ya
            está».
          </AlertMessage>
        ) : null}
      </SheetScrollArea>

      <SheetFooter>
        <Button
          type="submit"
          className="w-full"
          disabled={picked.length === 0 || mutation.isPending}
        >
          {picked.length === 1
            ? 'Traer 1 servicio'
            : `Traer ${String(picked.length)} servicios`}
        </Button>
      </SheetFooter>
    </form>
  )
}

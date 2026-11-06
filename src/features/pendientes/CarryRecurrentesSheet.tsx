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
  // Which ones the member flipped, rather than which are ticked: a row
  // starts ticked when the bill is marked recurring and unticked when it is
  // not, so this holds the exceptions and needs no syncing once the rows
  // load. XOR of the two below is what a row actually shows.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set())
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
  const isTicked = (row: (typeof rows)[number]): boolean =>
    row.pendiente.recurring !== flipped.has(row.pendiente.id)
  const picked = rows
    .filter((row) => !row.alreadyThere && isTicked(row))
    .map((row) => row.pendiente)
  // The ones the app already knows repeat lead; the rest follow under their
  // own heading, there to be ticked rather than to be scrolled past.
  const recurrentes = rows.filter((row) => row.pendiente.recurring)
  const resto = rows.filter((row) => !row.pendiente.recurring)
  const previousMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() - 1,
    1,
  )

  function toggle(id: string): void {
    setFlipped((current) => {
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

  function list(group: typeof rows, label: string): ReactElement | null {
    return group.length === 0 ? null : (
      <ul aria-label={label} className="flex flex-col">
        {group.map((row) => {
          const { pendiente, alreadyThere } = row
          return (
            <li key={pendiente.id}>
              <label
                className={`flex min-h-11 items-center gap-3 py-2 ${alreadyThere ? 'text-muted-foreground' : ''}`}
              >
                <input
                  type="checkbox"
                  className="accent-primary size-5 shrink-0"
                  checked={alreadyThere || isTicked(row)}
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
          )
        })}
      </ul>
    )
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
            No hay cuentas en {formatMonthLabel(previousMonth)} para traer.
          </p>
        ) : (
          <>
            {list(recurrentes, 'Servicios del mes pasado')}
            {/* The ones the app does not know repeat. They are here because
                the flag is set a month earlier, with the toggle off by
                default, so a bill that is monthly in real life can easily
                not be marked as one -- and this sheet was the one place
                that would have caught it. Unticked: nothing comes across
                unless it is asked for. Per direct feedback. */}
            {resto.length === 0 ? null : (
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">
                  No marcadas como recurrentes
                </span>
                <p className="text-muted-foreground text-xs">
                  Tildá las que también se repiten. Al traerlas quedan marcadas,
                  así el mes que viene ya vienen tildadas.
                </p>
                {list(resto, 'Otras cuentas del mes pasado')}
              </div>
            )}
          </>
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

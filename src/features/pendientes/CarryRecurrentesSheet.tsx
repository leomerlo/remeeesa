import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Repeat } from 'lucide-react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Sheet } from '@/components/ui/sheet'
import { formatBudgetAmount } from '@/lib/expenses'
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

// "Pasar recurrentes": last month's recurring bills as a checklist, carried
// into the viewed month only when a member picks them. Nothing carries over
// on its own any more -- per direct feedback, after doing it automatically
// on every payment left bills doubled.
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
        className="gap-1.5 self-start px-5"
        onClick={() => {
          setOpen(true)
        }}
      >
        <Repeat aria-hidden="true" />
        Pasar recurrentes
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Pasar recurrentes">
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1">
          <h2 className="text-title font-semibold">Pasar recurrentes</h2>
          <p className="text-muted-foreground text-sm">
            De {formatMonthLabel(previousMonth)} a{' '}
            {formatMonthLabel(monthStart)}
          </p>
        </div>

        {rowsQuery.isPending ? (
          <LoadingIndicator />
        ) : rowsQuery.isError ? (
          <AlertMessage>No se pudieron cargar los recurrentes</AlertMessage>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No hay recurrentes en {formatMonthLabel(previousMonth)}.
          </p>
        ) : (
          <ul aria-label="Recurrentes para pasar" className="flex flex-col">
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
                        : formatBudgetAmount(pendiente.expectedAmount)}
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
      </div>

      <div className="shrink-0 pt-6">
        <Button
          type="submit"
          className="w-full"
          disabled={picked.length === 0 || mutation.isPending}
        >
          {picked.length === 1
            ? 'Pasar 1 recurrente'
            : `Pasar ${String(picked.length)} recurrentes`}
        </Button>
      </div>
    </form>
  )
}

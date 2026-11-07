import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetFooter, SheetScrollArea } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  categoriesQueryKey,
  expensesQueryKey,
} from '@/features/expenses/queryKeys'
import {
  canPayResumen,
  listResumenCuotas,
  markResumenPaid,
  ResumenAlreadyPaidError,
  resumenMonthStart,
} from '@/lib/cards'
import { formatAmount, listCategories } from '@/lib/expenses'
import { formatDate, formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import {
  PendienteNotFoundError,
  PendienteNotPaidError,
  unmarkPendientePaid,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { localDateInputValue, parsePaymentDateInput } from './AddPendienteForm'
import { ConsumoRow } from './ConsumoRow'
import { pendientesQueryKey } from './queryKeys'

export type ResumenSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Who pays it: the generated expenses are attributed to them.
  readonly memberId: string
  readonly authorDisplayName: string
  // null keeps the sheet closed.
  readonly resumen: Pendiente | null
  readonly onClose: () => void
}

// "Resumen Visa de octubre de 2026": a card has one Resumen a month, and an
// overdue one can sit beside the current one, so the name alone is ambiguous.
export function resumenLabel(resumen: Pendiente): string {
  return `Resumen ${resumen.name} de ${formatMonthLabel(resumen.dueDate).toLowerCase()}`
}

// A card's Resumen, opened: the cuotas it adds up, and paying it (or undoing
// the payment).
export function ResumenSheet({
  db,
  householdId,
  memberId,
  authorDisplayName,
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
      title={resumen === null ? 'Resumen' : resumenLabel(resumen)}
    >
      {resumen === null ? null : (
        <>
          {/* The statement scrolls; what you do about it stays put at the
              bottom of the sheet. */}
          <SheetScrollArea className="gap-4">
            <ResumenDetail
              db={db}
              householdId={householdId}
              resumen={resumen}
            />
          </SheetScrollArea>
          <SheetFooter>
            <ResumenPayment
              db={db}
              householdId={householdId}
              memberId={memberId}
              authorDisplayName={authorDisplayName}
              resumen={resumen}
              onDone={onClose}
            />
          </SheetFooter>
        </>
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-title font-semibold">{resumen.name}</p>
        <p className="text-muted-foreground text-sm">
          {formatMonthLabel(resumen.dueDate)} · Vence el{' '}
          {formatDate(resumen.dueDate)}
        </p>
        <ResumenFigures resumen={resumen} />
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
          {cuotasQuery.data.cuotas.map((consumo) => (
            <ConsumoRow
              key={consumo.purchase.id}
              db={db}
              householdId={householdId}
              consumo={consumo}
              categories={cuotasQuery.data.categories}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// What the card will ask for, and -- once it is settled -- what it asked.
//
// A card bill is an estimate until it is paid: the figure is the cuotas
// logged so far, and it moves every time a consumo is added or removed.
// What the card actually charges is never knowable in advance (taxes,
// interest, the bank's own extras), so the real number is typed at the
// moment of paying and only then becomes the headline, with the estimate
// beside it as the comparison. Per direct feedback: las tarjetas siempre
// van a ser estimadas; cuando la marco pagada le sumo los impuestos.
function ResumenFigures({
  resumen,
}: {
  readonly resumen: Pendiente
}): ReactElement {
  const currency = resumen.currency ?? 'ARS'
  const estimated = resumen.estimatedAmount ?? 0
  if (resumen.status !== 'paid' || resumen.expectedAmount === null) {
    return (
      <>
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Estimado
        </span>
        <span className="money text-foreground text-2xl">
          {formatAmount(estimated, currency)}
        </span>
        <span className="text-muted-foreground text-sm">
          La suma de los consumos de abajo. Cuando la pagues, sumale los
          impuestos e intereses que te cobre el banco.
        </span>
      </>
    )
  }
  const difference =
    Math.round(resumen.expectedAmount * 100 - estimated * 100) / 100
  return (
    <>
      <span className="money text-foreground text-2xl">
        {formatAmount(resumen.expectedAmount, currency)}
      </span>
      <span className="text-muted-foreground text-sm">
        {difference === 0
          ? `Igual a los ${formatAmount(estimated, currency)} que habías cargado.`
          : `Cargaste ${formatAmount(estimated, currency)} · ${formatAmount(Math.abs(difference), currency)} ${difference > 0 ? 'más' : 'menos'} de lo que esperabas.`}
      </span>
    </>
  )
}

// The pay flow's amount and date, for a Resumen: the amount starts at the
// estimate and is meant to be corrected upwards to whatever the bank
// charged, and it can't be paid before its month starts. A paid one offers
// only the undo.
function ResumenPayment({
  db,
  householdId,
  memberId,
  authorDisplayName,
  resumen,
  onDone,
}: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly resumen: Pendiente
  readonly onDone: () => void
}): ReactElement {
  const queryClient = useQueryClient()
  // The estimate, there to be adjusted: paying is the moment the household
  // knows the real figure, and typing it is how the bank's extras get in.
  const [amount, setAmount] = useState(String(resumen.estimatedAmount ?? ''))
  const [paymentDate, setPaymentDate] = useState(
    localDateInputValue(new Date()),
  )
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())

  async function onSettled(): Promise<void> {
    // Card purchases sit under the expenses prefix, so their lock refreshes
    // with the generated expenses.
    await queryClient.invalidateQueries({
      queryKey: pendientesQueryKey({ householdId }),
    })
    await queryClient.invalidateQueries({
      queryKey: expensesQueryKey({ householdId }),
    })
    // Paying find-or-creates "Tarjeta".
    await queryClient.invalidateQueries({
      queryKey: categoriesQueryKey({ householdId }),
    })
  }

  const mutation = useMutation({
    mutationFn: async (action: 'pay' | 'undo') => {
      if (action === 'undo') {
        await unmarkPendientePaid({
          db,
          householdId,
          pendienteId: resumen.id,
        })
        return
      }
      await markResumenPaid({
        db,
        householdId,
        resumenId: resumen.id,
        memberId,
        authorDisplayName,
        amountPaid: Number(amount),
        paymentDate: parsePaymentDateInput(paymentDate),
      })
    },
    onSuccess: async () => {
      onDone()
      await onSettled()
    },
    onError: async (caught, action) => {
      // Someone else already paid, undid or removed it: this sheet is stale,
      // so refresh the lists behind it and say why.
      if (
        caught instanceof ResumenAlreadyPaidError ||
        caught instanceof PendienteNotPaidError ||
        caught instanceof PendienteNotFoundError
      ) {
        await onSettled()
      }
      setError(
        caught instanceof Error
          ? caught.message
          : action === 'undo'
            ? 'No se pudo deshacer el pago'
            : 'No se pudo pagar el resumen',
      )
    },
  })

  if (resumen.status === 'paid') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          {`Pagado el ${formatDate(resumen.paidAt ?? resumen.dueDate)}. Deshacer el pago borra los gastos que generó.`}
        </p>
        {error === null ? null : <AlertMessage>{error}</AlertMessage>}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={mutation.isPending}
          onClick={() => {
            setError(null)
            mutation.mutate('undo')
          }}
        >
          Deshacer pago
        </Button>
      </div>
    )
  }

  const payable = canPayResumen(resumen, new Date())

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    mutation.mutate('pay')
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-label="Pagar resumen"
      className="flex flex-col gap-4"
    >
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="resumen-amount">Monto pagado</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            {resumen.currency === 'USD' ? 'US$' : '$'}
          </span>
          <FormattedAmountInput
            id="resumen-amount"
            name="resumen-amount"
            className={resumen.currency === 'USD' ? 'pl-12' : 'pl-8'}
            value={amount}
            onChange={setAmount}
            autoComplete="off"
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Viene con el estimado puesto. Si el banco cobró impuestos o intereses,
          corregilo acá.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="resumen-payment-date">Fecha de pago</Label>
        <Input
          id="resumen-payment-date"
          name="resumen-payment-date"
          type="date"
          value={paymentDate}
          min={localDateInputValue(resumenMonthStart(resumen))}
          max={today}
          onChange={(event) => {
            setPaymentDate(event.target.value)
          }}
        />
      </div>
      {payable ? null : (
        <p
          id="resumen-not-yet-payable"
          className="text-muted-foreground text-xs"
        >
          {`Se puede pagar desde el ${formatDate(resumenMonthStart(resumen))}.`}
        </p>
      )}
      {error === null ? null : <AlertMessage>{error}</AlertMessage>}
      <Button
        type="submit"
        className="w-full"
        disabled={!payable || mutation.isPending}
        {...(payable ? {} : { 'aria-describedby': 'resumen-not-yet-payable' })}
      >
        Pagar resumen
      </Button>
    </form>
  )
}

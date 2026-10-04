import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  categoriesQueryKey,
  expensesQueryKey,
} from '@/features/expenses/queryKeys'
import {
  canPayResumen,
  listResumenCuotas,
  markResumenPaid,
  setResumenAmount,
  ResumenAlreadyPaidError,
  resumenMonthStart,
} from '@/lib/cards'
import { formatAmount, formatCurrency, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatDate, formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import {
  PendienteNotFoundError,
  PendienteNotPaidError,
  unmarkPendientePaid,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { localDateInputValue, parsePaymentDateInput } from './AddPendienteForm'
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
          <ResumenDetail db={db} householdId={householdId} resumen={resumen} />
          <ResumenPayment
            db={db}
            householdId={householdId}
            memberId={memberId}
            authorDisplayName={authorDisplayName}
            resumen={resumen}
            onDone={onClose}
          />
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
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain">
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
                <span className="money text-foreground shrink-0 text-lg">
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

// What the card billed, and what the household thought it would.
//
// Until the statement arrives there is only the estimate -- the cuotas
// logged so far -- and it is labelled as one, because it is not a debt. Once
// the real figure is loaded, that is the headline and the estimate becomes
// the comparison: how far off the household's own record was. Per direct
// feedback, the gap is shown and nothing is invented to close it.
function ResumenFigures({
  resumen,
}: {
  readonly resumen: Pendiente
}): ReactElement {
  const currency = resumen.currency ?? 'ARS'
  const estimated = resumen.estimatedAmount ?? 0
  if (resumen.expectedAmount === null) {
    return (
      <>
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Estimado
        </span>
        <span className="money text-foreground text-2xl">
          {formatAmount(estimated, currency)}
        </span>
        <span className="text-muted-foreground text-sm">
          Lo que fuiste cargando. Todavía no es una cuenta a pagar: cargá lo que
          te llegó en el resumen.
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

// Loading what the card actually billed. The one way a Resumen comes to owe
// anything: the household reads its statement and types the figure in.
function ResumenAmountForm({
  db,
  householdId,
  resumen,
  onSettled,
}: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumen: Pendiente
  readonly onSettled: () => Promise<void>
}): ReactElement {
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: () =>
      setResumenAmount({
        db,
        householdId,
        resumenId: resumen.id,
        amount: Number(amount),
      }),
    onSuccess: async () => {
      setError(null)
      await onSettled()
    },
    onError: async (caught: unknown) => {
      if (
        caught instanceof ResumenAlreadyPaidError ||
        caught instanceof PendienteNotFoundError
      ) {
        await onSettled()
      }
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cargar el monto del resumen',
      )
    },
  })

  return (
    <form
      aria-label="Cargar el resumen"
      className="flex shrink-0 flex-col gap-4 pt-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        mutation.mutate()
      }}
    >
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="resumen-real-amount">Lo que llegó en el resumen</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            {resumen.currency === 'USD' ? 'US$' : '$'}
          </span>
          <FormattedAmountInput
            id="resumen-real-amount"
            name="resumen-real-amount"
            className={resumen.currency === 'USD' ? 'pl-12' : 'pl-8'}
            value={amount}
            onChange={setAmount}
            autoComplete="off"
          />
        </div>
      </div>
      {error === null ? null : <AlertMessage>{error}</AlertMessage>}
      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        Cargar el resumen
      </Button>
    </form>
  )
}

// The pay flow's amount and date, for a Resumen: the amount defaults to the
// total, and it can't be paid before its month starts. A paid one offers
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
  const [amount, setAmount] = useState(String(resumen.expectedAmount ?? ''))
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
      <div className="flex shrink-0 flex-col gap-3 pt-6">
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

  // Nothing to pay until the statement is loaded: what is on screen is an
  // estimate, and paying an estimate is how a card purchase used to become
  // a debt on its own. Per direct feedback.
  if (resumen.expectedAmount === null) {
    return (
      <ResumenAmountForm
        db={db}
        householdId={householdId}
        resumen={resumen}
        onSettled={onSettled}
      />
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
      className="flex shrink-0 flex-col gap-4 pt-6"
    >
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="resumen-amount">Monto pagado</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            $
          </span>
          <FormattedAmountInput
            id="resumen-amount"
            name="resumen-amount"
            className="pl-8"
            value={amount}
            onChange={setAmount}
            autoComplete="off"
          />
        </div>
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

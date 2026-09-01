import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  CuentaAlreadyPaidError,
  CuentaNotFoundError,
  markCuentaPaid,
} from '@/lib/cuentas'
import type { Cuenta } from '@/lib/cuentas'
import { parseExpenseDate, parseExpensePrice } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { cuentasQueryKey } from './queryKeys'

export type MarkCuentaPaidFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly cuenta: Cuenta
  readonly onDone: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

// Duplicated from AddExpenseForm.tsx/AddCuentaForm.tsx -- this project
// tolerates this kind of small (15-line) helper duplication rather than
// factoring out a shared module for it.
function localDateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) {
    throw new Error('La fecha de pago no es válida')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error('La fecha de pago no es válida')
  }
  return date
}

type ParsedMarkCuentaPaidFields = {
  readonly finalAmount: number
  readonly paymentDate: Date
}

// parseExpensePrice/parseExpenseDate are reused for their validation logic
// (positive-number rounding; past-or-today-only), but their error wording is
// written for the expense domain ("gasto") -- wrong for this cuenta/payment
// context. Rewrap so the user never sees "gasto" here.
function parsePaymentAmount(rawAmount: string): number {
  // Blank must fail as "required", same idiom AddExpenseForm's price field
  // uses: Number('') is 0, and parseExpensePrice rejects non-positive values.
  try {
    return parseExpensePrice(Number(rawAmount.trim()))
  } catch {
    throw new Error('El monto pagado debe ser un número positivo')
  }
}

function parsePaymentDate(date: Date): Date {
  // parseDateInput already rejects an invalid/empty/malformed date string
  // before this runs, so the only failure mode left here is "in the future".
  try {
    return parseExpenseDate(date)
  } catch {
    throw new Error('La fecha de pago no puede ser futura')
  }
}

function parseMarkCuentaPaidFields(input: {
  readonly finalAmount: string
  readonly paymentDate: string
}): ParsedMarkCuentaPaidFields {
  return {
    finalAmount: parsePaymentAmount(input.finalAmount),
    paymentDate: parsePaymentDate(parseDateInput(input.paymentDate)),
  }
}

// markCuentaPaid (the shared @/lib/cuentas function) re-validates finalAmount/
// paymentDate itself via parseExpensePrice/parseExpenseDate, so those
// expense-worded messages could in principle still reach here directly from
// the mutation (bypassing parsePaymentAmount/parsePaymentDate above) -- e.g.
// a razor-thin midnight rollover between this component's and the shared
// function's own `new Date()` calls. Translate them the same way, so no path
// can surface "gasto" wording in this cuenta/payment context.
const EXPENSE_DOMAIN_MESSAGE_TRANSLATIONS: Readonly<Record<string, string>> = {
  'El precio del gasto debe ser un número positivo':
    'El monto pagado debe ser un número positivo',
  'La fecha del gasto no puede ser futura': 'La fecha de pago no puede ser futura',
  'La fecha del gasto no es válida': 'La fecha de pago no es válida',
}

function mutationErrorMessage(error: unknown): string {
  if (error instanceof CuentaAlreadyPaidError) {
    return 'Esta cuenta ya fue pagada'
  }
  if (error instanceof CuentaNotFoundError) {
    return 'Esta cuenta ya no existe'
  }
  if (error instanceof Error) {
    return EXPENSE_DOMAIN_MESSAGE_TRANSLATIONS[error.message] ?? error.message
  }
  return 'No se pudo marcar la cuenta como pagada'
}

export function MarkCuentaPaidForm({
  db,
  householdId,
  memberId,
  authorDisplayName,
  cuenta,
  onDone,
  onPendingChange,
}: MarkCuentaPaidFormProps): ReactElement {
  const queryClient = useQueryClient()
  const cuentasKey = cuentasQueryKey({ householdId })
  const [finalAmount, setFinalAmount] = useState(
    cuenta.expectedAmount === null ? '' : String(cuenta.expectedAmount),
  )
  const [paymentDate, setPaymentDate] = useState(
    localDateInputValue(new Date()),
  )
  const [error, setError] = useState<string | null>(null)
  const today = localDateInputValue(new Date())

  const mutation = useMutation({
    mutationFn: (fields: ParsedMarkCuentaPaidFields) =>
      markCuentaPaid({
        db,
        householdId,
        cuentaId: cuenta.id,
        memberId,
        authorDisplayName,
        finalAmount: fields.finalAmount,
        paymentDate: fields.paymentDate,
      }),
    onSuccess: async () => {
      setError(null)
      await queryClient.invalidateQueries({ queryKey: cuentasKey })
      onDone()
    },
    // A Cuenta that was already paid or deleted (e.g. by another household
    // member a moment earlier) can't be marked paid again -- show a clear
    // message instead of a false-success state, and refresh the pending
    // list so the stale row disappears once the sheet is dismissed. Unlike
    // AddCuentaForm's edit-mutation precedent (which auto-closes on this
    // outcome), the sheet stays open here so the user actually sees the
    // message -- mirrors AddExpenseForm's ExpenseNotFoundError handling.
    onError: async (caught) => {
      if (
        caught instanceof CuentaAlreadyPaidError ||
        caught instanceof CuentaNotFoundError
      ) {
        setError(mutationErrorMessage(caught))
        await queryClient.invalidateQueries({ queryKey: cuentasKey })
      }
    },
  })

  // Lets a container (e.g. MarkCuentaPaidSheet) keep the form mounted while
  // a submit is in flight, so a dismiss can't abandon a pending mutation and
  // silently swallow its result.
  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const fields = parseMarkCuentaPaidFields({ finalAmount, paymentDate })
      setError(null)
      mutation.mutate(fields)
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'No se pudo marcar la cuenta como pagada'
      setError(message)
    }
  }

  const alertMessage =
    error ??
    (mutation.isError &&
    !(
      mutation.error instanceof CuentaAlreadyPaidError ||
      mutation.error instanceof CuentaNotFoundError
    )
      ? mutationErrorMessage(mutation.error)
      : null)

  return (
    <form
      className="flex w-full flex-col items-center gap-8"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="mark-cuenta-amount"
          className="text-muted-foreground font-medium"
        >
          Monto pagado
        </Label>
        <Input
          id="mark-cuenta-amount"
          name="mark-cuenta-amount"
          value={finalAmount}
          onChange={(event) => {
            setFinalAmount(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="mark-cuenta-payment-date"
          className="text-muted-foreground font-medium"
        >
          Fecha de pago
        </Label>
        <Input
          id="mark-cuenta-payment-date"
          name="mark-cuenta-payment-date"
          type="date"
          value={paymentDate}
          max={today}
          onChange={(event) => {
            setPaymentDate(event.target.value)
          }}
        />
      </div>

      {alertMessage !== null ? (
        <p role="alert" className="text-sm font-medium">
          {alertMessage}
        </p>
      ) : null}

      <div className="flex w-full flex-col items-center gap-2">
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Marcar pagada
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          className="w-full"
          onClick={() => {
            setError(null)
            onDone()
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

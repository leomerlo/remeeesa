import type { ReactElement } from 'react'
import { formatAmount } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'

export type PendienteAmountProps = {
  readonly pendiente: Pendiente
}

// What a bill's figure says in a list, in all three of its states.
//
// A Resumen whose statement has not arrived is the interesting one: it
// shows what the household has logged against the card so far, labelled as
// an estimate, because it is not money the household owes yet. Showing it
// as a plain amount is exactly how a card purchase used to read as a debt.
// Per direct feedback: lo que voy cargando y lo que me llega son dos cosas,
// y tiene que quedar muy en claro cuál es cuál.
export function PendienteAmount({
  pendiente,
}: PendienteAmountProps): ReactElement | null {
  const currency = pendiente.currency ?? 'ARS'
  if (pendiente.expectedAmount !== null) {
    return (
      <span className="money text-foreground text-lg">
        {formatAmount(pendiente.expectedAmount, currency)}
      </span>
    )
  }
  if (pendiente.cardId !== undefined) {
    return (
      <span className="flex flex-col items-end">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Estimado
        </span>
        <span className="money text-muted-foreground text-lg">
          {formatAmount(pendiente.estimatedAmount ?? 0, currency)}
        </span>
      </span>
    )
  }
  if (pendiente.recurring) {
    // A recurring bill with no amount yet reads as incomplete/broken with
    // nothing where a price usually is -- a placeholder says "not filled in
    // yet" instead of looking like a rendering bug. A one-off Pendiente
    // with no amount is a different, deliberate case (see AddPendienteForm's
    // "Monto esperado" comment) and stays blank.
    return <span className="money text-muted-foreground text-lg">$ --,--</span>
  }
  return null
}

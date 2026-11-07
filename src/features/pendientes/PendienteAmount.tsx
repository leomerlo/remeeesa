import type { ReactElement } from 'react'
import { formatAmount } from '@/lib/expenses'
import type { Pendiente } from '@/lib/pendientes'

export type PendienteAmountProps = {
  readonly pendiente: Pendiente
}

// What a bill's figure says in a list.
//
// A card's Resumen is the interesting one: until it is paid it shows what
// the household has logged against the card, labelled as an estimate,
// because that is all it ever is. A card bill is an estimate by nature --
// what the card will charge includes taxes and interest nobody can add up
// in advance -- so it stays one right up to the moment it is paid, and the
// real figure is what gets typed then. Per direct feedback: las tarjetas
// siempre van a ser estimadas, nunca puede ser un número fijo.
export function PendienteAmount({
  pendiente,
}: PendienteAmountProps): ReactElement | null {
  const currency = pendiente.currency ?? 'ARS'
  const isUnpaidResumen =
    pendiente.cardId !== undefined && pendiente.status !== 'paid'
  if (pendiente.expectedAmount !== null && !isUnpaidResumen) {
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

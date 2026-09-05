import type { Pendiente } from './types'
import { isOverdue } from '@/lib/format'

// Which auto-debit bills the bank has already taken money for, and the app
// has not recorded yet.
//
// A bill marked auto-debit is not paid by the household -- the bank debits
// it on its own on the due date. So once that date has passed, the money is
// gone whether or not anyone opened the app, and leaving the bill sitting
// in "Por pagar" is simply wrong. These get settled automatically.
//
// A bill with no expected amount is deliberately left alone: there is no
// figure to record, so recording one would be inventing it. It stays in
// "Por pagar", wearing its badge, until someone fills the amount in.
export function autoDebitsToSettle(
  pendientes: readonly Pendiente[],
  now: Date = new Date(),
): readonly Pendiente[] {
  return pendientes.filter(
    (pendiente) =>
      pendiente.autoDebit &&
      pendiente.status === 'pending' &&
      pendiente.expectedAmount !== null &&
      isOverdue(pendiente.dueDate, now),
  )
}

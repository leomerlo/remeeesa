import type { Expense } from './types'

// A "Servicio" is a recurring bill -- rent, the gym, a subscription -- as
// opposed to a one-off Gasto.
//
// It used to be inferred from `pendienteId`: anything created by paying a
// Pendiente counted. That was wrong, and it showed. A one-off payment
// logged as a Pendiente so it would not be forgotten (an Osde bill, say)
// came out marked Servicio for the rest of its life, even with the
// Pendiente itself marked non-recurring. Per direct feedback.
//
// The flag is now written onto the Expense at the moment of payment, from
// the bill's own `recurring`, and read from there alone. Denormalised on
// purpose: the Pendiente behind it can be edited or deleted afterwards, so
// looking it up later would give a different answer than the one that was
// true when the money moved. `isService` is also what the manual "marcar
// como servicio" toggle sets, for an Expense logged directly that should
// count as one.
export function isServicio(expense: Expense): boolean {
  return expense.isService
}

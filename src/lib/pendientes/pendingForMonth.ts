import type { Pendiente } from './types'

// Every currently-pending Pendiente whose due date falls within the given
// month -- narrower than "all pending regardless of due date" (what Cuentas
// por pagar itself shows). Used to scope how much of a pending bill's amount
// counts against a given month's budget: per direct feedback, a bill due
// next month shouldn't already eat into this month's remaining budget --
// only the ones actually due within the month being viewed should.
export function pendientesDueInMonth(
  pendientes: readonly Pendiente[],
  monthStart: Date,
  monthEnd: Date,
): readonly Pendiente[] {
  return pendientes.filter(
    (pendiente) =>
      pendiente.status === 'pending' &&
      pendiente.dueDate >= monthStart &&
      pendiente.dueDate <= monthEnd,
  )
}

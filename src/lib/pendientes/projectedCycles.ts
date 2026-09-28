import { nextCycleDueDate } from './recurrence'
import type { Pendiente } from './types'

// A Pendiente as a month's list sees it: either a real record, or the next
// occurrence of a recurring bill worked out on the fly.
export type PendienteForMonth = Pendiente & {
  // True when no record exists for this cycle yet. A recurring bill's next
  // cycle is only written when the current one is paid, so until then the
  // months ahead had nothing in them -- the bill simply vanished from the
  // month it was for. Per direct feedback: "si es recurrente aunque no está
  // pago tiene que aparecer siempre en su mes correspondiente."
  //
  // A projection is a preview, not a record: it cannot be paid or edited,
  // because there is nothing to write to. Paying the real, earlier cycle is
  // what brings it into existence.
  readonly projected: boolean
}

// Ten years of cycles. A pendiente whose due date is further behind than
// that is not something to quietly extrapolate through.
const MAX_CYCLES = 120

function projectedId(pendiente: Pendiente, dueDate: Date): string {
  const month = String(dueDate.getMonth() + 1).padStart(2, '0')
  return `${pendiente.id}::${String(dueDate.getFullYear())}-${month}`
}

// The cycles a recurring bill would have in this month if the ones before it
// had been paid. One per unpaid recurring bill at most: cycles are advanced
// from the bill's own stored due date, exactly as markPendientePaid would
// advance them, so a projected date is the date the real record will carry.
//
// Only ever forward, and only from a bill that is still pending: a month
// earlier than the bill's own due date gets nothing, so past months are
// never given spending that did not happen.
export function projectRecurringCycles(
  pendientes: readonly Pendiente[],
  monthStart: Date,
  monthEnd: Date,
): readonly PendienteForMonth[] {
  const projected: PendienteForMonth[] = []
  for (const pendiente of pendientes) {
    if (
      !pendiente.recurring ||
      pendiente.status !== 'pending' ||
      pendiente.dueDate >= monthStart
    ) {
      continue
    }
    let dueDate = nextCycleDueDate(pendiente.dueDate)
    for (
      let cycle = 0;
      cycle < MAX_CYCLES && dueDate < monthStart;
      cycle += 1
    ) {
      dueDate = nextCycleDueDate(dueDate)
    }
    if (dueDate >= monthStart && dueDate <= monthEnd) {
      projected.push({
        ...pendiente,
        id: projectedId(pendiente, dueDate),
        dueDate,
        status: 'pending',
        paidExpenseId: null,
        paidAt: null,
        projected: true,
      })
    }
  }
  return projected
}

// Everything a month's list should show as still owed: the real pending
// records due in it, plus the projected next cycles of recurring bills that
// have not been paid yet. Real first, so anything actionable leads.
export function pendingForMonthWithProjections(
  pendientes: readonly Pendiente[],
  monthStart: Date,
  monthEnd: Date,
): readonly PendienteForMonth[] {
  const real = pendientes
    .filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.dueDate >= monthStart &&
        pendiente.dueDate <= monthEnd,
    )
    .map((pendiente) => ({ ...pendiente, projected: false }))
  return [...real, ...projectRecurringCycles(pendientes, monthStart, monthEnd)]
}

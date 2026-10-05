import type { Pendiente } from './types'

// How far out "approaching" reaches -- an unpaid Pendiente due today through
// 6 days from now (a 7-day window) counts as due soon. Matches the user's
// own framing of the Home banner: "siempre dentro de una semana de vencer".
export const DUE_SOON_WINDOW_DAYS = 7

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Everything unpaid that needs attention now: anything already past its due
// date, plus the next DUE_SOON_WINDOW_DAYS days. Oldest first, so what is
// already late leads.
//
// Overdue ones used to be left out, on the reading that "vencimientos que
// se acercan" is about what is still ahead. That was backwards: a bill
// three days late is more urgent than one due on Friday, and the one place
// the app raises a due date on its own was the one place it would not
// mention it. Per direct feedback.
export function pendientesDueSoon(
  pendientes: readonly Pendiente[],
  now: Date,
): readonly Pendiente[] {
  const windowEnd = startOfDay(now)
  windowEnd.setDate(windowEnd.getDate() + DUE_SOON_WINDOW_DAYS)

  return pendientes
    .filter(
      (pendiente) =>
        pendiente.status === 'pending' && pendiente.dueDate < windowEnd,
    )
    .toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
}

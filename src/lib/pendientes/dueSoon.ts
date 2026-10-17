import type { Pendiente } from './types'

// A card's Resumen is not a bill to pay until its statement has been loaded
// by hand: nothing is owed on an estimate, so it commits no money and
// belongs in none of the lists of what the household has to pay. It already
// has its own place on screen -- "Tarjetas el mes que viene" -- and showing
// it in both made the same card appear twice. Per direct feedback: solo
// tiene que aparecer ahí.
//
// Once the real amount is loaded it is an ordinary bill: owed, counted, and
// paid from wherever it is listed.
export function isBillToPay(pendiente: Pendiente): boolean {
  return pendiente.cardId === undefined || pendiente.expectedAmount !== null
}

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
        pendiente.status === 'pending' &&
        pendiente.dueDate < windowEnd &&
        isBillToPay(pendiente),
    )
    .toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
}

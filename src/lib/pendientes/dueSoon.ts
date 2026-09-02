import type { Pendiente } from './types'

// How far out "approaching" reaches -- an unpaid Pendiente due today through
// 6 days from now (a 7-day window) counts as due soon. Matches the user's
// own framing of the Home banner: "siempre dentro de una semana de vencer".
export const DUE_SOON_WINDOW_DAYS = 7

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Unpaid Pendientes whose due date falls within the next DUE_SOON_WINDOW_DAYS
// days (today included), soonest first. Already-overdue Pendientes are
// deliberately excluded -- they're still visible in Cuentas por pagar and
// /pendientes, but "vencimientos que se acercan" (due dates *approaching*)
// is specifically about what's still ahead, not what's already passed.
export function pendientesDueSoon(
  pendientes: readonly Pendiente[],
  now: Date,
): readonly Pendiente[] {
  const windowStart = startOfDay(now)
  const windowEnd = new Date(windowStart)
  windowEnd.setDate(windowEnd.getDate() + DUE_SOON_WINDOW_DAYS)

  return pendientes
    .filter(
      (pendiente) =>
        pendiente.status === 'pending' &&
        pendiente.dueDate >= windowStart &&
        pendiente.dueDate < windowEnd,
    )
    .toSorted((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
}

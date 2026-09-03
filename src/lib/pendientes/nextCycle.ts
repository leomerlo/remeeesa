import type { Pendiente } from './types'

function normalize(name: string): string {
  return name.trim().toLowerCase()
}

// True when `pendiente` is a recurring, still-pending row that is really
// "next cycle" -- i.e. the same series already has a paid entry in the same
// list (same name, case/whitespace-insensitive). markPendientePaid spawns
// the next cycle as a brand-new pendiente with no link back to the one it
// paid, so this is the only way to tell "this is next month's, already
// settled this month" apart from "this is genuinely still owed" without a
// schema change -- callers pass the exact same pendientes array shown on
// screen (e.g. listPendientesForMonth's pending + paid-this-month result),
// so a false match against an unrelated household is not possible.
export function isNextCycleAfterAPaidThisPeriod(
  pendiente: Pendiente,
  pendientesInView: readonly Pendiente[],
): boolean {
  if (pendiente.status !== 'pending' || !pendiente.recurring) {
    return false
  }
  const normalizedName = normalize(pendiente.name)
  return pendientesInView.some(
    (other) =>
      other.id !== pendiente.id &&
      other.status === 'paid' &&
      normalize(other.name) === normalizedName,
  )
}

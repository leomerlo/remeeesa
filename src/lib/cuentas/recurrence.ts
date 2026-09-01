// Advances a Cuenta due date by exactly one month for the next recurring
// cycle. Kept pure and synchronous on purpose: both HouseholdsDb adapters
// call it between the mark-paid status check and the writes, and that stretch
// has to stay free of awaits (and of anything that could throw mid-way
// through the writes) for the three-write transaction to stay atomic.
//
// Short months clamp to the last day of the target month (Jan 31 -> Feb 28,
// or Feb 29 in a leap year). The clamp is permanent by design: the next cycle
// is always computed from the previous cycle's stored day, so a Jan 31 cuenta
// becomes Feb 28 and then stays on the 28th rather than snapping back to 31.
// Snapping back would need an extra anchor-day field on the Cuenta, which is
// deliberately not stored -- see docs/cuentas-pendientes-design.md.
//
// Uses the same "day 0 = last day of the previous month" idiom as
// currentMonthRange in @/lib/expenses/remainingBudget, and relies on the Date
// constructor's own month overflow for the December -> January year rollover.
export function nextCycleDueDate(dueDate: Date): Date {
  const year = dueDate.getFullYear()
  const month = dueDate.getMonth()
  const lastDayOfTargetMonth = new Date(year, month + 2, 0).getDate()
  return new Date(
    year,
    month + 1,
    Math.min(dueDate.getDate(), lastDayOfTargetMonth),
    dueDate.getHours(),
    dueDate.getMinutes(),
    dueDate.getSeconds(),
    dueDate.getMilliseconds(),
  )
}

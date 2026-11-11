// What a bill still owes: the figure it asks for, minus whatever has
// already been handed over against it.
//
// A bill can be paid in more than one go -- the household goes to pay the
// Luz, does not take the whole figure, and puts down part of it. Each of
// those payments is an ordinary Gasto, so the month already counts that
// money as gone; what is still owed is only the rest, and counting the
// whole figure as owed on top of it would say the household spent it
// twice.
//
// Null means "not known yet", exactly what expectedAmount's null means: a
// bill whose figure has not arrived cannot owe an amount, whatever has
// been handed over against it.
//
// It lives here, rather than in lib/pendientes with the rest of what a
// bill is, so that every place a pending bill is added up goes through it
// -- those places take a bill structurally, precisely so lib/expenses
// does not have to import lib/pendientes. lib/pendientes/amountLeft is
// this same rule with a bill's status in front of it.
export function billOwed(bill: {
  readonly expectedAmount: number | null
  readonly paidSoFar?: number
}): number | null {
  if (bill.expectedAmount === null) {
    return null
  }
  // Never negative: handing over more than the bill said is a correction
  // waiting to happen, not a debt the other way round.
  return Math.max(0, bill.expectedAmount - (bill.paidSoFar ?? 0))
}

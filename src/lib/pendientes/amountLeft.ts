import { billOwed } from '@/lib/expenses/billOwed'
import type { Pendiente } from './types'

// What a bill still owes, once the part already handed over is taken off.
//
// A bill can be paid in more than one go: the household goes to pay the
// Luz, does not take the whole figure, and puts down part of it. Each of
// those payments is a Gasto of its own, so the month already counts that
// money as gone -- what is left to budget for is only the rest, and this
// is the figure every total of a pending bill is built on.
//
// Null means "not known yet", the same thing expectedAmount's null means:
// a bill whose figure has not arrived cannot owe an amount, whatever has
// been handed over against it. A paid bill owes nothing.
//
// The arithmetic itself is lib/expenses/billOwed, which is where every
// total of a pending bill reaches it -- this adds the one thing those
// totals cannot see, which is whether the bill is settled.
export function amountLeft(bill: Pendiente): number | null {
  if (bill.status === 'paid') {
    return 0
  }
  return billOwed(bill)
}

// What has been handed over against a bill so far. Zero on every bill
// nobody has part-paid, which is almost all of them.
export function paidSoFar(bill: Pendiente): number {
  return bill.paidSoFar ?? 0
}

// A bill that has been part-paid and is still waiting for the rest. The
// one state worth saying out loud in a list: "pagaste $40.000, falta
// $60.000" reads differently from either a bill nobody has touched or a
// settled one.
export function isPartlyPaid(bill: Pendiente): boolean {
  return bill.status === 'pending' && paidSoFar(bill) > 0
}

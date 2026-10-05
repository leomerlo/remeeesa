import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import type { HouseholdsDb } from '@/lib/households/types'
import {
  currentMonthRange,
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpensePrice,
} from '@/lib/expenses'
import type { Expense } from '@/lib/expenses/types'
import { nextCycleDueDate } from './recurrence'
import type { Pendiente } from './types'
import {
  parsePendienteDueDate,
  parsePendienteName,
  parseExpectedAmount,
} from './validate'

export class PendienteNotFoundError extends Error {
  override readonly name = 'PendienteNotFoundError'
}

export class PendienteAlreadyPaidError extends Error {
  override readonly name = 'PendienteAlreadyPaidError'
}

export class PendienteNotPaidError extends Error {
  override readonly name = 'PendienteNotPaidError'
}

export async function createPendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring?: boolean
  readonly autoDebit?: boolean
  readonly currency?: Currency
}): Promise<Pendiente> {
  return input.db.createPendiente({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parsePendienteName(input.name),
    dueDate: parsePendienteDueDate(input.dueDate),
    expectedAmount: parseExpectedAmount(input.expectedAmount),
    recurring: input.recurring,
    autoDebit: input.autoDebit,
    currency: input.currency,
  })
}

export async function getPendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
}): Promise<Pendiente | null> {
  return input.db.getPendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
}

export async function listPendientes(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Pendiente[]> {
  return input.db.listPendientes({ householdId: input.householdId })
}

// Every pending Pendiente (regardless of due date -- an overdue bill from
// three months ago stays actionable until it's paid, not just during the
// month it fell due) plus the settled ones *due* in the given month.
//
// Due date, not payment date. A servicio belongs to the month it was due
// for: scoping the settled half by when it was paid put next month's bill
// into this month's list the moment it was paid early -- listed under a
// September payment date while its own form said October -- and took it out
// of next month, where it belonged, so a recurring service could vanish
// from the month it was for entirely. Per direct feedback.
//
// Pending first (soonest due date first, from listPendientes), then the
// settled ones -- so the still-actionable half of the list never gets
// pushed down by completed history.
export async function listPendientesForMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}): Promise<readonly Pendiente[]> {
  const [pending, paidThisMonth] = await Promise.all([
    input.db.listPendientes({ householdId: input.householdId }),
    input.db.listPaidPendientesDueInMonth({
      householdId: input.householdId,
      monthStart: input.monthStart,
      monthEnd: input.monthEnd,
    }),
  ])
  return [...pending, ...paidThisMonth]
}

async function getPendienteOrThrow(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
}): Promise<Pendiente> {
  const existing = await input.db.getPendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
  if (existing === null) {
    throw new PendienteNotFoundError()
  }
  if (existing.status !== 'pending') {
    throw new PendienteAlreadyPaidError()
  }
  return existing
}

// Category is not re-resolved here -- the caller resolves a category name to
// a categoryId via findOrCreateCategory first, same as the create flow.
export async function updatePendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
  readonly categoryId?: string
  readonly name?: string
  readonly dueDate?: Date
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
  readonly autoDebit?: boolean
  readonly currency?: Currency
}): Promise<Pendiente> {
  const existing = await getPendienteOrThrow({
    db: input.db,
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })

  const categoryId = input.categoryId ?? existing.categoryId
  const name =
    input.name !== undefined ? parsePendienteName(input.name) : existing.name
  const dueDate =
    input.dueDate !== undefined
      ? parsePendienteDueDate(input.dueDate)
      : existing.dueDate
  const expectedAmount =
    input.expectedAmount !== undefined
      ? parseExpectedAmount(input.expectedAmount)
      : existing.expectedAmount
  const recurring = input.recurring ?? existing.recurring
  const autoDebit = input.autoDebit ?? existing.autoDebit
  const currency = input.currency ?? existing.currency ?? DEFAULT_CURRENCY

  return input.db.updatePendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    categoryId,
    name,
    dueDate,
    expectedAmount,
    recurring,
    autoDebit,
    currency,
  })
}

// Recurrence alone, which is the one thing about a Pendiente that stays
// editable after it is paid: whether this bill comes back next month is a
// question about next month, not about the payment. Everything else on a
// paid Pendiente is frozen -- see updatePendiente.
export async function setPendienteRecurrence(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
  readonly recurring: boolean
  readonly autoDebit: boolean
}): Promise<Pendiente> {
  // Not getPendienteOrThrow: that one refuses a paid Pendiente, and a paid
  // Pendiente is exactly what this is for.
  const existing = await input.db.getPendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
  if (existing === null) {
    throw new PendienteNotFoundError()
  }
  return input.db.setPendienteRecurrence({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    recurring: input.recurring,
    // A one-off is never on automatic debit, so switching Recurrente off
    // takes Débito automático with it wherever the call came from.
    autoDebit: input.recurring && input.autoDebit,
  })
}

export async function markPendientePaid(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly finalAmount: number
  readonly paymentDate: Date
  // What settled it, when it was one of the methods the household wrote
  // down. Null for cash. Never a credit one -- that settles next month and
  // goes through markPendientePaidWithCard instead.
  readonly paymentMethodId?: string | null
}): Promise<{
  pendiente: Pendiente
  expense: Expense
}> {
  return input.db.markPendientePaid({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    memberId: input.memberId,
    authorDisplayName: parseAuthorDisplayName(input.authorDisplayName),
    finalAmount: parseExpensePrice(input.finalAmount),
    paymentDate: parseExpenseDate(input.paymentDate),
    paymentMethodId: input.paymentMethodId ?? null,
  })
}

// Undoes a mistaken markPendientePaid: restores the Pendiente to pending and
// deletes the Expense that payment created. Per direct feedback -- there was
// no way to correct "I marked it paid, but it wasn't" once a paid card was
// display-only.
export async function unmarkPendientePaid(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
}): Promise<Pendiente> {
  const existing = await input.db.getPendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
  if (existing === null) {
    throw new PendienteNotFoundError()
  }
  if (existing.status !== 'paid') {
    throw new PendienteNotPaidError()
  }
  return input.db.unmarkPendientePaid({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
}

export async function deletePendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendienteId: string
}): Promise<void> {
  await getPendienteOrThrow({
    db: input.db,
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })

  return input.db.deletePendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
  })
}

export type RecurrenteToCarry = {
  readonly pendiente: Pendiente
  // The viewed month already has a bill of this name: still listed, so the
  // member sees the whole set, but there is nothing left to carry.
  readonly alreadyThere: boolean
}

// "Pasar recurrentes": last month's recurring bills, for a member to pick
// which ones come into the viewed month. Nothing carries over on its own --
// per direct feedback, after paying, undoing and paying again left one bill
// twice in the following month.
export async function listRecurrentesToCarry(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
}): Promise<readonly RecurrenteToCarry[]> {
  const viewed = currentMonthRange(input.monthStart)
  const previous = currentMonthRange(
    new Date(
      input.monthStart.getFullYear(),
      input.monthStart.getMonth() - 1,
      1,
    ),
  )
  const [pending, paidPrevious, paidViewed] = await Promise.all([
    input.db.listPendientes({ householdId: input.householdId }),
    input.db.listPaidPendientesDueInMonth({
      householdId: input.householdId,
      ...previous,
    }),
    input.db.listPaidPendientesDueInMonth({
      householdId: input.householdId,
      ...viewed,
    }),
  ])
  const all = [...pending, ...paidPrevious, ...paidViewed]
  const isDueIn = (
    pendiente: Pendiente,
    range: { monthStart: Date; monthEnd: Date },
  ): boolean =>
    pendiente.dueDate >= range.monthStart && pendiente.dueDate <= range.monthEnd
  const namesAlreadyThere = new Set(
    all.filter((pendiente) => isDueIn(pendiente, viewed)).map((p) => p.name),
  )
  // One row per bill: the same name twice last month is still one bill.
  const byName = new Map<string, Pendiente>()
  for (const pendiente of all) {
    if (
      pendiente.recurring &&
      isDueIn(pendiente, previous) &&
      !byName.has(pendiente.name)
    ) {
      byName.set(pendiente.name, pendiente)
    }
  }
  return [...byName.values()]
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
    .map((pendiente) => ({
      pendiente,
      alreadyThere: namesAlreadyThere.has(pendiente.name),
    }))
}

// Creates each picked bill one month on: same name, category, amount,
// currency and débito automático, due the same day of the month (see
// nextCycleDueDate).
// Not atomic -- if one write fails the others still land, and reopening the
// list shows those as already there.
export async function carryRecurrentes(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly pendientes: readonly Pendiente[]
}): Promise<readonly Pendiente[]> {
  return Promise.all(
    input.pendientes.map((pendiente) =>
      createPendiente({
        db: input.db,
        householdId: input.householdId,
        categoryId: pendiente.categoryId,
        name: pendiente.name,
        dueDate: nextCycleDueDate(pendiente.dueDate),
        expectedAmount: pendiente.expectedAmount,
        recurring: true,
        autoDebit: pendiente.autoDebit,
        // A dollar subscription is still a dollar one next month.
        currency: pendiente.currency,
      }),
    ),
  )
}

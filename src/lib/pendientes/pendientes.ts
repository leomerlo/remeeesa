import type { HouseholdsDb } from '@/lib/households/types'
import {
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpensePrice,
} from '@/lib/expenses'
import type { Expense } from '@/lib/expenses/types'
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
}): Promise<Pendiente> {
  return input.db.createPendiente({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parsePendienteName(input.name),
    dueDate: parsePendienteDueDate(input.dueDate),
    expectedAmount: parseExpectedAmount(input.expectedAmount),
    recurring: input.recurring,
    autoDebit: input.autoDebit,
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
// month it fell due) plus whichever ones were paid within the given month.
// Pending first (soonest due date first, from listPendientes), then paid
// ones (most recently paid first) -- so the still-actionable half of the
// list never gets pushed down by completed history.
export async function listPendientesForMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}): Promise<readonly Pendiente[]> {
  const [pending, paidThisMonth] = await Promise.all([
    input.db.listPendientes({ householdId: input.householdId }),
    input.db.listPendientesPaidInMonth({
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

  return input.db.updatePendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    categoryId,
    name,
    dueDate,
    expectedAmount,
    recurring,
    autoDebit,
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
}): Promise<{
  pendiente: Pendiente
  expense: Expense
  nextPendiente: Pendiente | null
}> {
  return input.db.markPendientePaid({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    memberId: input.memberId,
    authorDisplayName: parseAuthorDisplayName(input.authorDisplayName),
    finalAmount: parseExpensePrice(input.finalAmount),
    paymentDate: parseExpenseDate(input.paymentDate),
  })
}

// Undoes a mistaken markPendientePaid: restores the Pendiente to pending and
// deletes the Expense that payment created. Per direct feedback -- there was
// no way to correct "I marked it paid, but it wasn't" once a paid card was
// display-only. Doesn't touch any next-cycle Pendiente a recurring payment
// may have spawned -- that's a separate document with its own edit/delete,
// left for the member to remove themselves if it's now redundant, rather
// than this guessing at a name/date match that could delete the wrong one.
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

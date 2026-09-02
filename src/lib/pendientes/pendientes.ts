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

export async function createPendiente(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring?: boolean
}): Promise<Pendiente> {
  return input.db.createPendiente({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parsePendienteName(input.name),
    dueDate: parsePendienteDueDate(input.dueDate),
    expectedAmount: parseExpectedAmount(input.expectedAmount),
    recurring: input.recurring,
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

  return input.db.updatePendiente({
    householdId: input.householdId,
    pendienteId: input.pendienteId,
    categoryId,
    name,
    dueDate,
    expectedAmount,
    recurring,
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

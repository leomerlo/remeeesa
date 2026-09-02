import type { HouseholdsDb } from '@/lib/households/types'
import {
  parseAuthorDisplayName,
  parseExpenseDate,
  parseExpensePrice,
} from '@/lib/expenses'
import type { Expense } from '@/lib/expenses/types'
import type { Cuenta } from './types'
import {
  parseCuentaDueDate,
  parseCuentaName,
  parseExpectedAmount,
} from './validate'

export class CuentaNotFoundError extends Error {
  override readonly name = 'CuentaNotFoundError'
}

export class CuentaAlreadyPaidError extends Error {
  override readonly name = 'CuentaAlreadyPaidError'
}

export async function createCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring?: boolean
}): Promise<Cuenta> {
  return input.db.createCuenta({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parseCuentaName(input.name),
    dueDate: parseCuentaDueDate(input.dueDate),
    expectedAmount: parseExpectedAmount(input.expectedAmount),
    recurring: input.recurring,
  })
}

export async function getCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuentaId: string
}): Promise<Cuenta | null> {
  return input.db.getCuenta({
    householdId: input.householdId,
    cuentaId: input.cuentaId,
  })
}

export async function listPendingCuentas(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Cuenta[]> {
  return input.db.listPendingCuentas({ householdId: input.householdId })
}

async function getPendingCuentaOrThrow(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuentaId: string
}): Promise<Cuenta> {
  const existing = await input.db.getCuenta({
    householdId: input.householdId,
    cuentaId: input.cuentaId,
  })
  if (existing === null) {
    throw new CuentaNotFoundError()
  }
  if (existing.status !== 'pending') {
    throw new CuentaAlreadyPaidError()
  }
  return existing
}

// Category is not re-resolved here -- the caller resolves a category name to
// a categoryId via findOrCreateCategory first, same as the create flow.
export async function updateCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuentaId: string
  readonly categoryId?: string
  readonly name?: string
  readonly dueDate?: Date
  readonly expectedAmount?: number | null
  readonly recurring?: boolean
}): Promise<Cuenta> {
  const existing = await getPendingCuentaOrThrow({
    db: input.db,
    householdId: input.householdId,
    cuentaId: input.cuentaId,
  })

  const categoryId = input.categoryId ?? existing.categoryId
  const name =
    input.name !== undefined ? parseCuentaName(input.name) : existing.name
  const dueDate =
    input.dueDate !== undefined
      ? parseCuentaDueDate(input.dueDate)
      : existing.dueDate
  const expectedAmount =
    input.expectedAmount !== undefined
      ? parseExpectedAmount(input.expectedAmount)
      : existing.expectedAmount
  const recurring = input.recurring ?? existing.recurring

  return input.db.updateCuenta({
    householdId: input.householdId,
    cuentaId: input.cuentaId,
    categoryId,
    name,
    dueDate,
    expectedAmount,
    recurring,
  })
}

export async function markCuentaPaid(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuentaId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly finalAmount: number
  readonly paymentDate: Date
}): Promise<{ cuenta: Cuenta; expense: Expense; nextCuenta: Cuenta | null }> {
  return input.db.markCuentaPaid({
    householdId: input.householdId,
    cuentaId: input.cuentaId,
    memberId: input.memberId,
    authorDisplayName: parseAuthorDisplayName(input.authorDisplayName),
    finalAmount: parseExpensePrice(input.finalAmount),
    paymentDate: parseExpenseDate(input.paymentDate),
  })
}

export async function deleteCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cuentaId: string
}): Promise<void> {
  await getPendingCuentaOrThrow({
    db: input.db,
    householdId: input.householdId,
    cuentaId: input.cuentaId,
  })

  return input.db.deleteCuenta({
    householdId: input.householdId,
    cuentaId: input.cuentaId,
  })
}

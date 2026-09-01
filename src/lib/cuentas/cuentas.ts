import type { HouseholdsDb } from '@/lib/households/types'
import type { Cuenta } from './types'
import {
  parseCuentaDueDate,
  parseCuentaName,
  parseExpectedAmount,
} from './validate'

export async function createCuenta(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
}): Promise<Cuenta> {
  return input.db.createCuenta({
    householdId: input.householdId,
    categoryId: input.categoryId,
    name: parseCuentaName(input.name),
    dueDate: parseCuentaDueDate(input.dueDate),
    expectedAmount: parseExpectedAmount(input.expectedAmount),
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

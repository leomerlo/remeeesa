import type { Expense } from './types'

// An Expense reads as a "servicio" either because it was created by paying
// a real Pendiente (pendienteId) or because someone manually tagged it that
// way (isService) -- the only route available for an Expense that predates
// pendienteId, or that was logged as a plain Gasto but should count as one.
export function isServicio(expense: Expense): boolean {
  return expense.pendienteId !== null || expense.isService
}

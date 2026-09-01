export function parseCuentaName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre de la cuenta no puede estar vacío')
  }
  return trimmed
}

// Unlike expense dates, a cuenta's due date is explicitly allowed to be in
// the past (e.g. logging an overdue bill) or the future -- only an invalid
// Date is rejected.
export function parseCuentaDueDate(dueDate: Date): Date {
  if (Number.isNaN(dueDate.getTime())) {
    throw new Error('La fecha de la cuenta no es válida')
  }
  return dueDate
}

export function parseExpectedAmount(
  amount: number | null | undefined,
): number | null {
  if (amount === null || amount === undefined) {
    return null
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El monto esperado de la cuenta debe ser un número positivo')
  }
  const rounded = Math.round(amount * 100) / 100
  if (rounded <= 0) {
    throw new Error('El monto esperado de la cuenta debe ser un número positivo')
  }
  return rounded
}

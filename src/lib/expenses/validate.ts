export function parseCategoryName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre de la categoría no puede estar vacío')
  }
  return trimmed
}

export function parseExpenseName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del gasto no puede estar vacío')
  }
  return trimmed
}

export function parseExpensePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('El precio del gasto debe ser un número positivo')
  }
  const rounded = Math.round(price * 100) / 100
  if (rounded <= 0) {
    throw new Error('El precio del gasto debe ser un número positivo')
  }
  return rounded
}

export function parseAuthorDisplayName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('El nombre del autor no puede estar vacío')
  }
  return trimmed
}

export function parseExpenseDate(expenseDate: Date, now = new Date()): Date {
  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error('La fecha del gasto no es válida')
  }
  const expenseDay =
    expenseDate.getFullYear() * 10000 +
    (expenseDate.getMonth() + 1) * 100 +
    expenseDate.getDate()
  const today =
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  if (expenseDay > today) {
    throw new Error('La fecha del gasto no puede ser futura')
  }
  return expenseDate
}

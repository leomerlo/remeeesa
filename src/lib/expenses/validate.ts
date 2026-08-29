import { isDateInCurrentMonth } from './remainingBudget'

export function parseCategoryName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Category name must be non-empty')
  }
  return trimmed
}

export function parseExpenseName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Expense name must be non-empty')
  }
  return trimmed
}

export function parseExpensePrice(price: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error('Expense price must be a positive number')
  }
  const rounded = Math.round(price * 100) / 100
  if (rounded <= 0) {
    throw new Error('Expense price must be a positive number')
  }
  return rounded
}

export function parseAuthorDisplayName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') {
    throw new Error('Author display name must be non-empty')
  }
  return trimmed
}

export function parseExpenseDate(expenseDate: Date, now = new Date()): Date {
  if (Number.isNaN(expenseDate.getTime())) {
    throw new Error('Expense date must be a valid date')
  }
  const expenseDay =
    expenseDate.getFullYear() * 10000 +
    (expenseDate.getMonth() + 1) * 100 +
    expenseDate.getDate()
  const today =
    now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
  if (expenseDay > today) {
    throw new Error('Expense date cannot be in the future')
  }
  return expenseDate
}

export function parseExpenseDateInCurrentMonth(
  expenseDate: Date,
  now = new Date(),
): Date {
  const parsed = parseExpenseDate(expenseDate, now)
  if (!isDateInCurrentMonth(parsed, now)) {
    throw new Error('Expense date must be in the current calendar month')
  }
  return parsed
}

export function assertExpenseInCurrentMonth(
  expenseDate: Date,
  now = new Date(),
): void {
  if (!isDateInCurrentMonth(expenseDate, now)) {
    throw new Error('Expense is not in the current calendar month')
  }
}

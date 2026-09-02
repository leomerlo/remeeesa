import { Timestamp } from 'firebase/firestore'
import {
  isRecord,
  parseRequiredString,
  parseTimestamp,
} from '@/lib/firestore/documentParsing'
import type { Pendiente, PendienteStatus } from './types'
import { parsePendienteName } from './validate'

function parseNullableNumber(value: unknown, field: string): number | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'number') {
    throw new Error(`${field} must be a number or null`)
  }
  return value
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`)
  }
  return value
}

function parsePendienteStatus(value: unknown): PendienteStatus {
  if (value !== 'pending' && value !== 'paid') {
    throw new Error("status must be 'pending' or 'paid'")
  }
  return value
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null`)
  }
  return value
}

export function parsePendienteDocument(input: {
  readonly id: string
  readonly data: unknown
}): Pendiente {
  if (input.id.trim() === '') {
    throw new Error('Pendiente id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Pendiente document must be an object')
  }

  const {
    household_id,
    category_id,
    name,
    due_date,
    expected_amount,
    recurring,
    status,
    paid_expense_id,
    created_at,
  } = input.data
  if (typeof name !== 'string') {
    throw new Error('Pendiente name must be a string')
  }

  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    categoryId: parseRequiredString(category_id, 'category_id'),
    name: parsePendienteName(name),
    dueDate: parseTimestamp(due_date, 'due_date'),
    expectedAmount: parseNullableNumber(expected_amount, 'expected_amount'),
    recurring: parseBoolean(recurring, 'recurring'),
    status: parsePendienteStatus(status),
    paidExpenseId: parseNullableString(paid_expense_id, 'paid_expense_id'),
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

export function pendienteToDocument(input: {
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
  readonly status: PendienteStatus
  readonly paidExpenseId: string | null
  readonly createdAt: Date
}): {
  readonly household_id: string
  readonly category_id: string
  readonly name: string
  readonly due_date: Date
  readonly expected_amount: number | null
  readonly recurring: boolean
  readonly status: PendienteStatus
  readonly paid_expense_id: string | null
  readonly created_at: Date
} {
  return {
    household_id: input.householdId,
    category_id: input.categoryId,
    name: input.name,
    due_date: input.dueDate,
    expected_amount: input.expectedAmount,
    recurring: input.recurring,
    status: input.status,
    paid_expense_id: input.paidExpenseId,
    created_at: input.createdAt,
  }
}

export function toFirestorePendienteDate(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

import { parseCurrency } from '@/lib/money'
import { Timestamp } from 'firebase/firestore'
import {
  isRecord,
  parseOptionalTimestamp,
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
    auto_debit,
    status,
    paid_expense_id,
    paid_at,
    created_at,
    card_id,
    purchase_ids,
    paid_expense_ids,
    paid_purchase_id,
    estimated_amount,
    currency,
  } = input.data
  if (typeof name !== 'string') {
    throw new Error('Pendiente name must be a string')
  }

  // A Resumen written before the estimate and the bill were told apart
  // carried its cuota total in expected_amount, which made what the
  // household had been logging into a debt on its own. Under the model
  // that replaced it, that figure is the estimate and the bill is simply
  // not known yet -- so these read as "esperando el resumen" until
  // somebody loads what the card actually billed. Per direct feedback.
  // Loading it writes both fields, so a document only reads as legacy
  // once.
  const isLegacyResumen =
    card_id !== undefined && estimated_amount === undefined
  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    categoryId: parseRequiredString(category_id, 'category_id'),
    name: parsePendienteName(name),
    dueDate: parseTimestamp(due_date, 'due_date'),
    expectedAmount: isLegacyResumen
      ? null
      : parseNullableNumber(expected_amount, 'expected_amount'),
    recurring: parseBoolean(recurring, 'recurring'),
    // Missing on any Pendiente written before auto-debit existed -- absent
    // means the household pays it themselves, which is what every one of
    // those was.
    autoDebit:
      auto_debit === undefined ? false : parseBoolean(auto_debit, 'auto_debit'),
    status: parsePendienteStatus(status),
    paidExpenseId: parseNullableString(paid_expense_id, 'paid_expense_id'),
    // Absent on every Pendiente not paid with a credit card, which is
    // almost all of them -- so it is left off rather than written as null.
    ...(paid_purchase_id === undefined
      ? {}
      : {
          paidPurchaseId: parseNullableString(
            paid_purchase_id,
            'paid_purchase_id',
          ),
        }),
    // Missing (not just null) on any Pendiente doc written before this field
    // existed -- treated the same as "never paid", matching every other
    // field this session has widened with a legacy-doc fallback.
    paidAt: parseOptionalTimestamp(paid_at, 'paid_at'),
    createdAt: parseTimestamp(created_at, 'created_at'),
    // Only a Resumen carries these; every other Pendiente leaves them out.
    ...(card_id === undefined
      ? {}
      : {
          cardId: parseRequiredString(card_id, 'card_id'),
          purchaseIds: parseStringList(purchase_ids, 'purchase_ids'),
          estimatedAmount: isLegacyResumen
            ? (parseNullableNumber(expected_amount, 'expected_amount') ?? 0)
            : (parseNullableNumber(estimated_amount, 'estimated_amount') ?? 0),
          // A Resumen written before a card could hold two currencies is a
          // peso one, which is what its card was.
          currency: parseCurrency(currency),
          // Absent until the Resumen is first paid.
          ...(paid_expense_ids === undefined
            ? {}
            : {
                paidExpenseIds: parseStringList(
                  paid_expense_ids,
                  'paid_expense_ids',
                ),
              }),
        }),
  }
}

export function parseStringList(
  value: unknown,
  field: string,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item): item is string => typeof item === 'string')
  ) {
    throw new Error(`${field} must be a list of strings`)
  }
  return value
}

export function pendienteToDocument(input: {
  readonly householdId: string
  readonly categoryId: string
  readonly name: string
  readonly dueDate: Date
  readonly expectedAmount: number | null
  readonly recurring: boolean
  readonly autoDebit: boolean
  readonly status: PendienteStatus
  readonly paidExpenseId: string | null
  readonly paidAt: Date | null
  readonly createdAt: Date
}): {
  readonly household_id: string
  readonly category_id: string
  readonly name: string
  readonly due_date: Date
  readonly expected_amount: number | null
  readonly recurring: boolean
  readonly auto_debit: boolean
  readonly status: PendienteStatus
  readonly paid_expense_id: string | null
  readonly paid_at: Date | null
  readonly created_at: Date
} {
  return {
    household_id: input.householdId,
    category_id: input.categoryId,
    name: input.name,
    due_date: input.dueDate,
    expected_amount: input.expectedAmount,
    recurring: input.recurring,
    auto_debit: input.autoDebit,
    status: input.status,
    paid_expense_id: input.paidExpenseId,
    paid_at: input.paidAt,
    created_at: input.createdAt,
  }
}

export function toFirestorePendienteDate(date: Date): Timestamp {
  return Timestamp.fromDate(date)
}

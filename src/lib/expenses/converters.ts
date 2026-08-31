import { Timestamp } from 'firebase/firestore'
import { colorForCategoryName } from './categoryColor'
import type { Category, Expense } from './types'
import {
  parseCategoryName,
  parseExpenseName,
  parseExpensePrice,
} from './validate'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasToDate(value: unknown): value is { toDate: () => unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  )
}

function parseTimestamp(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value
  }
  if (hasToDate(value)) {
    const date = value.toDate()
    if (date instanceof Date && !Number.isNaN(date.getTime())) {
      return date
    }
  }
  throw new Error(`${field} must be a timestamp`)
}

function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

export function parseCategoryDocument(input: {
  readonly id: string
  readonly data: unknown
}): Category {
  if (input.id.trim() === '') {
    throw new Error('Category id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Category document must be an object')
  }

  const { household_id, name, color, created_at } = input.data
  if (typeof name !== 'string') {
    throw new Error('Category name must be a string')
  }

  const parsedName = parseCategoryName(name)
  // Legacy categories created before this field existed have no stored color.
  // Fall back to computing it from the name (same rule as creation) instead
  // of rejecting the document -- this repo has real household data
  // predating this field. The computed value is not written back here; it's
  // only ever persisted the next time the category is actually written.
  const parsedColor =
    typeof color === 'string' && color.trim() !== ''
      ? color
      : colorForCategoryName(parsedName)

  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    name: parsedName,
    color: parsedColor,
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

export function categoryToDocument(input: {
  readonly householdId: string
  readonly name: string
  readonly color: string
  readonly createdAt: Date
}): {
  readonly household_id: string
  readonly name: string
  readonly color: string
  readonly created_at: Date
} {
  return {
    household_id: input.householdId,
    name: input.name,
    color: input.color,
    created_at: input.createdAt,
  }
}

export function parseExpenseDocument(input: {
  readonly id: string
  readonly data: unknown
}): Expense {
  if (input.id.trim() === '') {
    throw new Error('Expense id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Expense document must be an object')
  }

  const {
    household_id,
    category_id,
    member_id,
    author_display_name,
    name,
    price,
    comments,
    expense_date,
    created_at,
  } = input.data
  if (typeof name !== 'string') {
    throw new Error('Expense name must be a string')
  }
  if (typeof price !== 'number') {
    throw new Error('Expense price must be a number')
  }
  if (typeof comments !== 'string') {
    throw new Error('Expense comments must be a string')
  }
  if (typeof author_display_name !== 'string') {
    throw new Error('author_display_name must be a string')
  }

  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    categoryId: parseRequiredString(category_id, 'category_id'),
    memberId: parseRequiredString(member_id, 'member_id'),
    authorDisplayName: parseRequiredString(
      author_display_name,
      'author_display_name',
    ),
    name: parseExpenseName(name),
    price: parseExpensePrice(price),
    comments,
    expenseDate: parseTimestamp(expense_date, 'expense_date'),
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

export function toFirestoreExpenseDate(date: Date): Timestamp {
  // Midday local stays on the picked calendar day and within 12 hours of
  // "now", so rules can allow today with expense_date < request.time + 1d.
  const normalized = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0,
    0,
  )
  return Timestamp.fromDate(normalized)
}

export function expenseToDocument(input: {
  readonly householdId: string
  readonly categoryId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly name: string
  readonly price: number
  readonly comments: string
  readonly expenseDate: Date
  readonly createdAt: Date
}): {
  readonly household_id: string
  readonly category_id: string
  readonly member_id: string
  readonly author_display_name: string
  readonly name: string
  readonly price: number
  readonly comments: string
  readonly expense_date: Date
  readonly created_at: Date
} {
  return {
    household_id: input.householdId,
    category_id: input.categoryId,
    member_id: input.memberId,
    author_display_name: input.authorDisplayName,
    name: input.name,
    price: input.price,
    comments: input.comments,
    expense_date: input.expenseDate,
    created_at: input.createdAt,
  }
}

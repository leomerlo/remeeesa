// Shared low-level parsing helpers for turning raw Firestore document data
// into typed domain values. Used by every `*/converters.ts` module that
// reads documents back out of Firestore (households, expenses, pendientes).

export function isRecord(value: unknown): value is Record<string, unknown> {
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

export function parseTimestamp(value: unknown, field: string): Date {
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

export function parseOptionalTimestamp(
  value: unknown,
  field: string,
): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  return parseTimestamp(value, field)
}

export function parseRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`)
  }
  return value
}

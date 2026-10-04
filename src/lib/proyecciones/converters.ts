import {
  isRecord,
  parseRequiredString,
  parseTimestamp,
} from '@/lib/firestore/documentParsing'
import type { Projection } from './types'

// Anything of the wrong type inside is dropped rather than failing the whole
// document: a projection is a scratchpad, and losing one edited row is a far
// better outcome than a screen that will not open.
export function parseProjectionDocument(input: {
  readonly id: string
  readonly data: unknown
}): Projection {
  if (!isRecord(input.data)) {
    throw new Error('Projection document must be an object')
  }
  const { household_id, month_start, excluded, overrides } = input.data
  return {
    householdId: parseRequiredString(household_id, 'household_id'),
    monthStart: parseTimestamp(month_start, 'month_start'),
    excluded: Array.isArray(excluded)
      ? excluded.filter((key): key is string => typeof key === 'string')
      : [],
    overrides: isRecord(overrides)
      ? Object.fromEntries(
          Object.entries(overrides).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : {},
  }
}

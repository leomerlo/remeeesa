import {
  isRecord,
  parseRequiredString,
  parseTimestamp,
} from '@/lib/firestore/documentParsing'
import type { Card } from './types'

export function parseCardDocument(input: {
  readonly id: string
  readonly data: unknown
}): Card {
  if (input.id.trim() === '') {
    throw new Error('Card id must be non-empty')
  }
  if (!isRecord(input.data)) {
    throw new Error('Card document must be an object')
  }
  const { household_id, name, created_at } = input.data
  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    name: parseRequiredString(name, 'name').trim(),
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

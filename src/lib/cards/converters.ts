import {
  isRecord,
  parseRequiredString,
  parseTimestamp,
} from '@/lib/firestore/documentParsing'
import { parseStringList } from '@/lib/pendientes/converters'
import { parseCurrency } from '@/lib/money'
import type { Card, CardPurchase } from './types'

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
  const { household_id, name, currency, created_at } = input.data
  return {
    id: input.id,
    householdId: parseRequiredString(household_id, 'household_id'),
    name: parseRequiredString(name, 'name').trim(),
    // Every card written before currencies existed is in pesos.
    currency: parseCurrency(currency),
    createdAt: parseTimestamp(created_at, 'created_at'),
  }
}

export function parseCardPurchaseDocument(input: {
  readonly id: string
  readonly data: unknown
}): CardPurchase {
  if (!isRecord(input.data)) {
    throw new Error('Card purchase document must be an object')
  }
  const d = input.data
  if (typeof d.total !== 'number' || !Number.isFinite(d.total)) {
    throw new Error('total must be a number')
  }
  if (typeof d.cuotas !== 'number' || !Number.isInteger(d.cuotas)) {
    throw new Error('cuotas must be an integer')
  }
  return {
    id: input.id,
    householdId: parseRequiredString(d.household_id, 'household_id'),
    cardId: parseRequiredString(d.card_id, 'card_id'),
    categoryId: parseRequiredString(d.category_id, 'category_id'),
    memberId: parseRequiredString(d.member_id, 'member_id'),
    authorDisplayName: parseRequiredString(
      d.author_display_name,
      'author_display_name',
    ),
    name: parseRequiredString(d.name, 'name'),
    total: d.total,
    cuotas: d.cuotas,
    purchaseDate: parseTimestamp(d.purchase_date, 'purchase_date'),
    comments: typeof d.comments === 'string' ? d.comments : '',
    createdAt: parseTimestamp(d.created_at, 'created_at'),
    // Absent until one of its Resúmenes is paid.
    paidResumenIds:
      d.paid_resumen_ids === undefined
        ? []
        : parseStringList(d.paid_resumen_ids, 'paid_resumen_ids'),
  }
}

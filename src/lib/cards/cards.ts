import type { HouseholdsDb } from '@/lib/households/types'
import type { Card } from './types'
import { parseCardName } from './validate'

export class CardNameTakenError extends Error {
  override readonly name = 'CardNameTakenError'

  constructor() {
    super('Ya existe una tarjeta con ese nombre.')
  }
}

export async function listCards(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
}): Promise<readonly Card[]> {
  const cards = await input.db.listCards({ householdId: input.householdId })
  return [...cards].sort((left, right) => left.name.localeCompare(right.name))
}

export async function createCard(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly name: string
}): Promise<Card> {
  const name = parseCardName(input.name)
  // ponytail: client-side uniqueness check can race (two members adding the
  // same name at once); move to name-keyed doc ids if that ever matters.
  const existing = await input.db.listCards({ householdId: input.householdId })
  const lower = name.toLowerCase()
  if (existing.some((card) => card.name.toLowerCase() === lower)) {
    throw new CardNameTakenError()
  }
  return input.db.createCard({ householdId: input.householdId, name })
}

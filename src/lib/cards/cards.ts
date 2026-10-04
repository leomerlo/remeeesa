import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
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
  // Pesos unless said otherwise; a card's currency is fixed when it is
  // created, since its past Resúmenes cannot change denomination.
  readonly currency?: Currency
}): Promise<Card> {
  const name = parseCardName(input.name)
  // ponytail: client-side uniqueness check can race (two members adding the
  // same name at once); move to name-keyed doc ids if that ever matters.
  await assertNameFree(input.db, input.householdId, name)
  return input.db.createCard({
    householdId: input.householdId,
    name,
    currency: input.currency ?? DEFAULT_CURRENCY,
  })
}

// A card created before currencies existed reads as pesos, which is right
// for most of them and wrong for the dollar one -- so this is editable
// rather than fixed at creation. It only changes the card: the expenses a
// paid Resumen already wrote keep the currency stamped on them, so past
// months are not re-denominated behind anyone's back. Per direct feedback.
export async function updateCardCurrency(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly currency: Currency
}): Promise<Card> {
  return input.db.updateCardCurrency({
    householdId: input.householdId,
    cardId: input.cardId,
    currency: input.currency,
  })
}

// Same rules as createCard; the card's own name doesn't count as taken, so a
// change in case alone is allowed. Every Resumen of the card is renamed with
// it, paid ones too; expenses a payment already saved keep their name.
export async function renameCard(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly name: string
}): Promise<Card> {
  const name = parseCardName(input.name)
  await assertNameFree(input.db, input.householdId, name, input.cardId)
  return input.db.renameCard({
    householdId: input.householdId,
    cardId: input.cardId,
    name,
  })
}

async function assertNameFree(
  db: HouseholdsDb,
  householdId: string,
  name: string,
  exceptCardId?: string,
): Promise<void> {
  const existing = await db.listCards({ householdId })
  const lower = name.toLowerCase()
  if (
    existing.some(
      (card) => card.id !== exceptCardId && card.name.toLowerCase() === lower,
    )
  ) {
    throw new CardNameTakenError()
  }
}

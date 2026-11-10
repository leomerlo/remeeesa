import { DEFAULT_CURRENCY } from '@/lib/money'
import type { CardCurrency } from '@/lib/money'
import type { CardBrand, PaymentMethodKind } from './types'
import type { HouseholdsDb } from '@/lib/households/types'
import type { Card } from './types'
import { parseCardCurrencyFor, parseCardName } from './validate'

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
  // What it does with the money. A credit card unless said otherwise --
  // which is what every method in here was before kinds existed.
  readonly kind?: PaymentMethodKind
  // Pesos unless said otherwise. 'BOTH' for a card billed in pesos and in
  // dollars, which then keeps one Resumen per currency per month.
  readonly currency?: CardCurrency
  // Which card it is. Only ever the mark on its card; "otra" when unsaid.
  readonly brand?: CardBrand
}): Promise<Card> {
  const name = parseCardName(input.name)
  // ponytail: client-side uniqueness check can race (two members adding the
  // same name at once); move to name-keyed doc ids if that ever matters.
  await assertNameFree(input.db, input.householdId, name)
  const kind = input.kind ?? 'credito'
  return input.db.createCard({
    householdId: input.householdId,
    name,
    kind,
    currency: parseCardCurrencyFor({
      kind,
      currency: input.currency ?? DEFAULT_CURRENCY,
    }),
    brand: input.brand ?? 'otra',
  })
}

// Everything the card's own edit form can change, in one write. The form has
// one "Guardar", so this is one call rather than three that can half-fail
// and leave a card renamed but still in the wrong currency.
export async function updateCard(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly name: string
  readonly kind: PaymentMethodKind
  readonly currency: CardCurrency
  readonly brand: CardBrand
}): Promise<Card> {
  const name = parseCardName(input.name)
  await assertNameFree(input.db, input.householdId, name, input.cardId)
  return input.db.updateCard({
    householdId: input.householdId,
    cardId: input.cardId,
    name,
    kind: input.kind,
    currency: parseCardCurrencyFor({
      kind: input.kind,
      currency: input.currency,
    }),
    brand: input.brand,
  })
}

// A card nothing points at. Anything else is refused rather than silently
// orphaning its purchases and its Resúmenes -- they carry its id, and a
// card id that resolves to nothing is a bill with no explanation.
export async function deleteCard(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
}): Promise<void> {
  return input.db.deleteCard({
    householdId: input.householdId,
    cardId: input.cardId,
  })
}

// A card created before currencies existed reads as pesos, which is right
// for most of them and wrong for the dollar one -- so this is editable
// rather than fixed at creation. It only changes the card: every purchase
// and every Resumen keeps the currency stamped on it, so widening a card to
// 'BOTH', or narrowing it back, never re-denominates what is already there.
// Per direct feedback.
export async function updateCardCurrency(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly currency: CardCurrency
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

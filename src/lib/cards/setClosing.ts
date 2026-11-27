import type { HouseholdsDb } from '@/lib/households/types'
import { closingMonthKey, closingShift, parseClosingDay } from './closing'
import type { ClosingMonth } from './closing'
import {
  CardNotFoundError,
  CardPurchaseLockedError,
  listCardPurchasesInMonth,
  updateCardPurchase,
} from './purchases'
import type { Card, CardPurchase } from './types'

export class ClosingDayNotOnCreditError extends Error {
  override readonly name = 'ClosingDayNotOnCreditError'
  constructor() {
    super('Solo una tarjeta de crédito tiene fecha de cierre.')
  }
}

export type ClosingDayResult = {
  readonly card: Card
  // Consumos that changed Resumen because of this.
  readonly moved: readonly CardPurchase[]
  // Consumos that should have moved and could not, because one of the
  // Resúmenes they are in is already paid. The household is told rather
  // than left with a figure that quietly disagrees with the bank.
  readonly locked: readonly CardPurchase[]
}

// How far back setting a cierre will go looking for consumos to re-place.
// Two years is past anything a household is still reconciling, and it
// stops a mistyped month from walking the database.
const MAX_MONTHS = 24

function monthsFrom(start: ClosingMonth, now: Date): readonly Date[] {
  const [year, month] = start.split('-').map(Number)
  const out: Date[] = []
  const first = new Date(year ?? now.getFullYear(), (month ?? 1) - 1, 1)
  const last = new Date(now.getFullYear(), now.getMonth(), 1)
  for (let at = first; at <= last && out.length < MAX_MONTHS;) {
    out.push(at)
    at = new Date(at.getFullYear(), at.getMonth() + 1, 1)
  }
  return out
}

// Telling the app what day the card closed, and moving what that changes.
//
// The day alone would be half the job: the household sets it when it sees
// the statement, which is after the consumos of that month are already
// loaded. So everything bought on or after the cierre has to leave the
// Resumen it was put in and join the next one, with both totals following
// it. That is the same move a consumo makes when its date changes, so it
// goes through the same transaction rather than a second one written here.
export async function setCardClosingDay(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly cardId: string
  readonly day: number
  // The month this cierre starts applying from; this month when unsaid.
  // It carries forward until another month sets a different one, which is
  // what makes it a field you edit rather than one you fill in monthly.
  readonly month?: ClosingMonth
  readonly now?: Date
}): Promise<ClosingDayResult> {
  const day = parseClosingDay(input.day)
  const now = input.now ?? new Date()
  const month = input.month ?? closingMonthKey(now)

  const cards = await input.db.listCards({ householdId: input.householdId })
  const card = cards.find((candidate) => candidate.id === input.cardId)
  if (card === undefined) throw new CardNotFoundError()
  if (card.kind !== 'credito') throw new ClosingDayNotOnCreditError()

  const closings = { ...card.closings, [month]: day }
  const saved = await input.db.setCardClosings({
    householdId: input.householdId,
    cardId: input.cardId,
    closings,
  })

  const moved: CardPurchase[] = []
  const locked: CardPurchase[] = []
  for (const monthStart of monthsFrom(month, now)) {
    const purchases = await listCardPurchasesInMonth({
      db: input.db,
      householdId: input.householdId,
      monthStart,
      monthEnd: new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        1,
      ),
    })
    for (const purchase of purchases) {
      if (purchase.cardId !== card.id) continue
      const next = closingShift(closings, purchase.purchaseDate)
      if ((purchase.resumenShift ?? 0) === next) continue
      try {
        // Everything it already says, so only the Resumen it lands in
        // changes; updateCardPurchase reads the cierre back off the card
        // and works the shift out for itself.
        moved.push(
          await updateCardPurchase({
            db: input.db,
            householdId: input.householdId,
            purchaseId: purchase.id,
            cardId: purchase.cardId,
            categoryId: purchase.categoryId,
            name: purchase.name,
            total: purchase.total,
            cuotas: purchase.cuotas,
            purchaseDate: purchase.purchaseDate,
            comments: purchase.comments,
            currency: purchase.currency,
          }),
        )
      } catch (error) {
        if (error instanceof CardPurchaseLockedError) {
          locked.push(purchase)
          continue
        }
        throw error
      }
    }
  }

  return { card: saved, moved, locked }
}

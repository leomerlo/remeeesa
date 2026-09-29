import { useQuery } from '@tanstack/react-query'
import { listCardPurchasesInMonth, listCards } from '@/lib/cards'
import type { CardPurchase } from '@/lib/cards'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { cardPurchasesInMonthQueryKey } from './queryKeys'

// The month's card purchases for the movements lists (Home's recent list and
// Histórico), with each card's name to mark them by. They are listed there
// but never summed: they count through their Resúmenes instead.
export function useCardPurchasesInMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}) {
  const { db, householdId, monthStart, monthEnd } = input
  return useQuery({
    queryKey: [
      ...cardPurchasesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: async () => {
      const [purchases, cards] = await Promise.all([
        listCardPurchasesInMonth({ db, householdId, monthStart, monthEnd }),
        listCards({ db, householdId }),
      ])
      return {
        purchases,
        cardNameById: new Map(cards.map((card) => [card.id, card.name])),
      }
    },
  })
}

export type MovementRow =
  | { readonly kind: 'expense'; readonly expense: Expense; readonly date: Date }
  | {
      readonly kind: 'purchase'
      readonly purchase: CardPurchase
      readonly date: Date
    }

// By calendar day, then by when it was logged: an Expense is stored at
// midday and a card purchase at midnight, so their raw times would put every
// expense of a day ahead of that day's purchases.
export function newestFirst(left: MovementRow, right: MovementRow): number {
  const day = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const createdAt = (row: MovementRow): number =>
    (row.kind === 'expense' ? row.expense : row.purchase).createdAt.getTime()
  return day(right.date) - day(left.date) || createdAt(right) - createdAt(left)
}

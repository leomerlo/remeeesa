import { useQuery } from '@tanstack/react-query'
import { listCardPurchasesInMonth, listCards } from '@/lib/cards'
import type { CardPurchase } from '@/lib/cards'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { cardsQueryKey } from '@/features/household/cardsQueryKey'
import { cardPurchasesInMonthQueryKey } from './queryKeys'

// The month's card purchases for the movements lists (Home's recent list and
// Histórico), with each card's name to mark them by. They are listed there
// but never summed: they count through their Resúmenes instead.
//
// A failed read degrades to no purchases rather than an error: the month's
// Expenses, which the lists exist for, still show.
export function useCardPurchasesInMonth(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly monthStart: Date
  readonly monthEnd: Date
}): {
  readonly isPending: boolean
  readonly purchases: readonly CardPurchase[]
  readonly cardNameById: ReadonlyMap<string, string>
} {
  const { db, householdId, monthStart, monthEnd } = input
  const purchasesQuery = useQuery({
    queryKey: [
      ...cardPurchasesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listCardPurchasesInMonth({ db, householdId, monthStart, monthEnd }),
  })
  // The same cache entry Ajustes and the add-gasto form read.
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey({ householdId }),
    queryFn: () => listCards({ db, householdId }),
  })
  return {
    isPending: purchasesQuery.isPending || cardsQuery.isPending,
    purchases: purchasesQuery.data ?? [],
    cardNameById: new Map(
      (cardsQuery.data ?? []).map((card) => [card.id, card.name]),
    ),
  }
}

export type MovementRow =
  | { readonly kind: 'expense'; readonly expense: Expense; readonly date: Date }
  | {
      readonly kind: 'purchase'
      readonly purchase: CardPurchase
      readonly date: Date
    }

// By calendar day, then by when it was logged: a purchase logged before
// purchase dates moved to midday is stored at midnight, and its raw time would
// sort it behind every expense of that day.
export function newestFirst(left: MovementRow, right: MovementRow): number {
  const day = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const createdAt = (row: MovementRow): number =>
    (row.kind === 'expense' ? row.expense : row.purchase).createdAt.getTime()
  return day(right.date) - day(left.date) || createdAt(right) - createdAt(left)
}

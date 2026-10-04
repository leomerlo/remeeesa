import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { cssVars } from '@/lib/cssVars'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { categoriesQueryKey } from '@/features/expenses'
import { membersQueryKey } from '@/features/household'
import {
  currentMonthRange,
  formatAmount,
  formatCurrency,
  isServicio,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import {
  colorForCategoryName,
  inkForCategoryColor,
} from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatDate } from '@/lib/format'
import type { Expense } from '@/lib/expenses'
import type { CardPurchase } from '@/lib/cards'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { CARD_PURCHASE_LOCKED_MESSAGE, cardPurchaseMark } from '@/lib/cards'
import { expensesInMonthQueryKey } from './queryKeys'
import { newestFirst, useCardPurchasesInMonth } from './useCardPurchasesInMonth'
import type { MovementRow as Row } from './useCardPurchasesInMonth'

export type RecentExpensesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
  readonly onEditPurchase?: (
    purchase: CardPurchase,
    categoryName: string,
  ) => void
  // Defaults to the current month. MonthNavigator's viewed month flows down
  // to this (and every other Home section that reads a month of Expenses)
  // so paging back a month moves the whole page together, not just the two
  // budget cards.
  readonly monthStart?: Date
  readonly monthEnd?: Date
  // Opens the page's add form from the empty state. Optional: a screen
  // without one of its own simply shows the empty state with nothing to
  // press, rather than a button that goes nowhere.
  readonly onAddGasto?: () => void
}

// A phone shows five before "Ver más"; a desktop window has the height for
// ten, so all ten are rendered and the last five are hidden below `lg` with
// a class rather than with a JS media query -- the month's expenses are
// already in hand either way, so this costs no extra read and nothing has
// to re-render when the window is resized across the breakpoint.
const RECENT_EXPENSES_LIMIT = 5
const RECENT_EXPENSES_LIMIT_WIDE = 10

// This month's one-off spending ("Últimos gastos del mes" on Home), most
// recent first, capped so an active month doesn't turn Home into a second
// Histórico -- that screen is where "see everything" belongs. Excludes
// servicios (recurring bills, whether linked via a real Pendiente or
// manually tagged) -- per direct feedback, Home already shows those up in
// Cuentas por pagar, so repeating them here read as double-counting; a
// servicio's own history still shows in Histórico. Matches the approved
// comp's plain, buttonless cards -- there is no edit/delete affordance on
// the row itself. Tapping a row opens it for editing (onEditExpense), and
// deleting lives inside that edit form (AddExpenseForm) instead.
//
// Two separate queries, not one combined fetch: CategoryMiniSummary,
// PersonMiniSummary and MonthNavigator's current-month card all read
// expensesInMonthQueryKey/categoriesQueryKey with a queryFn that resolves
// to a plain array. A combined { expenses, categories } shape under the
// same key would collide with theirs -- same key, different data shape --
// and whichever query populated the cache first would feed the wrong
// shape to every other subscriber. Matching their exact shape (and the
// same month-timestamp key suffix) is what makes Tanstack Query's cache
// dedupe the fetch instead of corrupting it.
export function RecentExpensesList({
  db,
  householdId,
  onEditExpense,
  onEditPurchase,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
  onAddGasto,
}: RecentExpensesListProps): ReactElement {
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const expensesQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      }),
  })
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })
  // Author name is resolved live from the current member list rather than
  // trusted from the expense's own stored authorDisplayName: that field is a
  // snapshot taken when the expense was created/last reassigned, so it goes
  // stale the moment someone corrects their name in Ajustes. Falling back to
  // the stored value covers a member who has since left the household.
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
  })
  const purchasesQuery = useCardPurchasesInMonth({
    db,
    householdId,
    monthStart,
    monthEnd,
  })

  if (
    expensesQuery.isPending ||
    categoriesQuery.isPending ||
    membersQuery.isPending ||
    purchasesQuery.isPending
  ) {
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="flex w-full flex-col gap-3 text-sm"
      >
        <span className="sr-only">Cargando…</span>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-card card-surface flex w-full items-center gap-3 rounded-2xl p-4"
          >
            <Skeleton className="size-11 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (
    expensesQuery.isError ||
    categoriesQuery.isError ||
    membersQuery.isError
  ) {
    const failed = expensesQuery.isError
      ? expensesQuery.error
      : (categoriesQuery.error ?? membersQuery.error)
    const message =
      failed instanceof Error ? failed.message : 'No se pudo cargar los gastos'
    return <AlertMessage>{message}</AlertMessage>
  }

  // Servicios (recurring bills) are excluded -- Cuentas por pagar already
  // shows those, and a servicio's own history still shows in Histórico.
  const oneOffExpenses = expensesQuery.data.filter(
    (expense) => !isServicio(expense),
  )
  // Card purchases sit among the gastos of their purchase month, marked, but
  // count only through their Resúmenes -- this list has no total to keep
  // them out of.
  const rows: readonly Row[] = [
    ...oneOffExpenses.map((expense): Row => ({
      kind: 'expense',
      expense,
      date: expense.expenseDate,
    })),
    ...purchasesQuery.purchases.map((purchase): Row => ({
      kind: 'purchase',
      purchase,
      date: purchase.purchaseDate,
    })),
  ].sort(newestFirst)
  const visibleRows = rows.slice(0, RECENT_EXPENSES_LIMIT_WIDE)
  const hasOverflow = rows.length > RECENT_EXPENSES_LIMIT
  const categories = categoriesQuery.data
  if (visibleRows.length === 0) {
    return (
      <EmptyState
        illustration={ILLUSTRATIONS.writing}
        title="Todavía no anotaron nada"
        description="Los gastos del día a día van acá. Anotalos en el momento en que pagás."
        {...(onAddGasto === undefined
          ? {}
          : {
              action: (
                <Button
                  type="button"
                  onClick={() => {
                    onAddGasto()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Cargar el primero
                </Button>
              ),
            })}
      />
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  const memberById = new Map(
    membersQuery.data.map((member) => [member.userId, member]),
  )

  return (
    <div className="flex w-full flex-col gap-3">
      <ul
        aria-label="Últimos gastos del mes"
        className="flex w-full flex-col gap-3 text-sm"
      >
        {visibleRows.map((row, index) => {
          const categoryId =
            row.kind === 'expense'
              ? row.expense.categoryId
              : row.purchase.categoryId
          const category = categoryById.get(categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)
          const item = row.kind === 'expense' ? row.expense : row.purchase
          const onEdit =
            row.kind === 'expense'
              ? onEditExpense &&
                (() => {
                  onEditExpense(row.expense, category?.name ?? '')
                })
              : // A purchase with a cuota in a paid Resumen is read-only.
                row.purchase.paidResumenIds.length === 0
                ? onEditPurchase &&
                  (() => {
                    onEditPurchase(row.purchase, category?.name ?? '')
                  })
                : undefined

          const rowContent = (
            <>
              <span
                aria-hidden="true"
                data-testid="category-icon"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
                style={cssVars({
                  '--swatch-color': categoryColor,
                  '--swatch-ink': inkForCategoryColor(categoryColor),
                })}
              >
                <CategoryIcon
                  className="size-5 text-[var(--swatch-ink)]"
                  aria-hidden="true"
                />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-foreground truncate font-bold">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      'money text-lg',
                      row.kind === 'purchase'
                        ? 'text-muted-foreground'
                        : 'text-foreground',
                    )}
                  >
                    {row.kind === 'expense'
                      ? formatAmount(row.expense.price, row.expense.currency)
                      : formatCurrency(row.purchase.total)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <CategoryBadge name={categoryName} color={categoryColor} />
                  <span>{formatDate(row.date)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {memberById.get(item.memberId)?.displayName ??
                      item.authorDisplayName}
                  </span>
                </div>
                {row.kind === 'purchase' ? (
                  <span className="text-xs text-muted-foreground">
                    {cardPurchaseMark(
                      purchasesQuery.cardNameById.get(row.purchase.cardId) ??
                        'Tarjeta',
                      row.purchase.cuotas,
                    )}
                  </span>
                ) : null}
                {row.kind === 'purchase' &&
                row.purchase.paidResumenIds.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {CARD_PURCHASE_LOCKED_MESSAGE}
                  </span>
                ) : null}
              </div>
            </>
          )

          return (
            <li
              key={`${row.kind}-${item.id}`}
              className={cn(
                index >= RECENT_EXPENSES_LIMIT && 'hidden lg:block',
              )}
            >
              {/* A card purchase edits in the add-gasto form, an expense in
                  the expense form. */}
              {onEdit !== undefined ? (
                <button
                  type="button"
                  className="bg-card card-surface flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                  aria-label={`Editar ${item.name}`}
                  onClick={onEdit}
                >
                  {rowContent}
                </button>
              ) : (
                <div className="bg-card card-surface flex w-full items-center gap-3 rounded-2xl p-4">
                  {rowContent}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {hasOverflow ? (
        // A secondary button, not a bare text link: it is the one thing to
        // do at the foot of this list, and a link floating under a column
        // of cards read as a caption rather than as something to press.
        // Per direct feedback, at every width.
        // Pinned right from `lg`, where every other footer action on the
        // page already is; full width on a phone, where there is nothing to
        // pin it against. Per direct feedback.
        <Button
          asChild
          variant="outline"
          className="w-full lg:w-auto lg:self-end"
        >
          <Link to="/historico">Ver más</Link>
        </Button>
      ) : null}
    </div>
  )
}

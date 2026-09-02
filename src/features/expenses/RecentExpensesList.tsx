import { useQuery } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { categoriesQueryKey } from '@/features/expenses'
import {
  currentMonthRange,
  formatCurrency,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { expensesInMonthQueryKey } from './queryKeys'

export type RecentExpensesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}

const RECENT_EXPENSES_LIMIT = 10

// This month's movements ("Últimos movimientos" on Home), most recent
// first, capped so an active month doesn't turn Home into a second
// Histórico -- that screen is where "see everything" belongs. Matches the
// approved comp's plain, buttonless cards -- there is no edit/delete
// affordance on the row itself. Tapping a row opens it for editing
// (onEditExpense), and deleting lives inside that edit form
// (AddExpenseForm) instead.
//
// Two separate queries, not one combined fetch: CategoryMiniSummary,
// PersonMiniSummary and MonthNavigator's current-month card all read
// expensesInMonthQueryKey/categoriesQueryKey with a queryFn that resolves
// to a plain array. A combined { expenses, categories } shape under the
// same key would collide with theirs -- same key, different data shape --
// and whichever query populated the cache first would feed the wrong
// shape to every other subscriber. Matching their exact shape is what
// makes Tanstack Query's cache dedupe the fetch instead of corrupting it.
export function RecentExpensesList({
  db,
  householdId,
  onEditExpense,
}: RecentExpensesListProps): ReactElement {
  const monthRange = useMemo(() => currentMonthRange(), [])
  const expensesQuery = useQuery({
    queryKey: expensesInMonthQueryKey({ householdId }),
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart: monthRange.monthStart,
        monthEnd: monthRange.monthEnd,
      }),
  })
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  if (expensesQuery.isPending || categoriesQuery.isPending) {
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
            className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4"
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

  if (expensesQuery.isError || categoriesQuery.isError) {
    const failed = expensesQuery.isError
      ? expensesQuery.error
      : categoriesQuery.error
    const message =
      failed instanceof Error ? failed.message : 'No se pudo cargar los gastos'
    return <AlertMessage>{message}</AlertMessage>
  }

  const expenses = expensesQuery.data.slice(0, RECENT_EXPENSES_LIMIT)
  const categories = categoriesQuery.data
  if (expenses.length === 0) {
    return (
      <>
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos este mes
        </p>
      </>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <ul
      aria-label="Últimos movimientos"
      className="flex w-full flex-col gap-3 text-sm"
    >
      {expenses.map((expense) => {
        const category = categoryById.get(expense.categoryId)
        const categoryName = category?.name ?? 'Categoría desconocida'
        const categoryColor =
          category?.color ?? colorForCategoryName(categoryName)
        const CategoryIcon = iconForCategoryName(categoryName)

        const rowContent = (
          <>
            <span
              aria-hidden="true"
              data-testid="category-icon"
              className="flex size-11 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: categoryColor }}
            >
              <CategoryIcon className="size-5 text-white" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-foreground font-medium">
                  {expense.name}
                </span>
                <span className="font-display text-lg text-foreground">
                  {formatCurrency(expense.price)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                <span>{categoryName}</span>
                <span aria-hidden="true">·</span>
                <span>{formatShortDate(expense.expenseDate)}</span>
                <span aria-hidden="true">·</span>
                <span>{expense.authorDisplayName}</span>
              </div>
            </div>
          </>
        )

        return (
          <li key={expense.id}>
            {onEditExpense !== undefined ? (
              <button
                type="button"
                className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
                aria-label={`Editar ${expense.name}`}
                onClick={() => {
                  onEditExpense(expense, category?.name ?? '')
                }}
              >
                {rowContent}
              </button>
            ) : (
              <div className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4">
                {rowContent}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import {
  formatCurrency,
  listCategories,
  listRecentExpenses,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import type { Expense } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { recentExpensesQueryKey } from './queryKeys'

export type RecentExpensesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}

const RECENT_EXPENSES_LIMIT = 10

function formatExpenseDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// All-time recent-movements list ("Últimos movimientos" on Home). Matches
// the approved comp's plain, buttonless cards -- there is no edit/delete
// affordance on the row itself. Tapping a row opens it for editing
// (onEditExpense), and deleting lives inside that edit form
// (AddExpenseForm) instead, since HistoricoPage is still a bare placeholder
// and editing can't be dropped from the app entirely.
export function RecentExpensesList({
  db,
  householdId,
  onEditExpense,
}: RecentExpensesListProps): ReactElement {
  const recentExpensesKey = recentExpensesQueryKey({
    householdId,
    limit: RECENT_EXPENSES_LIMIT,
  })

  const expensesQuery = useQuery({
    queryKey: recentExpensesKey,
    queryFn: async () => {
      const [expenses, categories] = await Promise.all([
        listRecentExpenses({
          db,
          householdId,
          limit: RECENT_EXPENSES_LIMIT,
        }),
        listCategories({ db, householdId }),
      ])
      return { expenses, categories }
    },
  })

  if (expensesQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (expensesQuery.isError) {
    const message =
      expensesQuery.error instanceof Error
        ? expensesQuery.error.message
        : 'No se pudo cargar los gastos'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const { expenses, categories } = expensesQuery.data
  if (expenses.length === 0) {
    return (
      <>
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos
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
                <span>{formatExpenseDate(expense.expenseDate)}</span>
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

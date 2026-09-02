import { useInfiniteQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import {
  formatCurrency,
  listCategories,
  listExpenseHistoryPage,
} from '@/lib/expenses'
import type { LucideIcon } from 'lucide-react'
import type { Category, Expense } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { expenseHistoryQueryKey } from './queryKeys'

export type ExpenseHistoryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}

function monthLabel(date: Date): string {
  const label = date.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
  // es-AR renders this as "agosto de 2026"; the screen wants it capitalised
  // as a heading.
  return label.charAt(0).toUpperCase() + label.slice(1)
}

type MonthGroup = {
  readonly key: string
  readonly label: string
  readonly expenses: readonly Expense[]
}

// Pages already arrive as whole calendar months (listExpenseHistoryPage), so
// grouping is a straight walk: a month can never be split across two pages,
// which is what lets each header render exactly once.
function groupByMonth(expenses: readonly Expense[]): readonly MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const expense of expenses) {
    const key = `${String(expense.expenseDate.getFullYear())}-${String(
      expense.expenseDate.getMonth(),
    )}`
    const last = groups[groups.length - 1]
    if (last !== undefined && last.key === key) {
      groups[groups.length - 1] = {
        ...last,
        expenses: [...last.expenses, expense],
      }
      continue
    }
    groups.push({
      key,
      label: monthLabel(expense.expenseDate),
      expenses: [expense],
    })
  }
  return groups
}

// The icon arrives as a prop rather than being looked up in here: it is one
// of a fixed set of module-level components, but resolving it inside a
// component body reads as creating a component during render (and trips the
// static-components lint rule), so the lookup stays in the caller's map.
function ExpenseRow({
  expense,
  category,
  CategoryIcon,
  onEditExpense,
}: {
  readonly expense: Expense
  readonly category: Category | undefined
  readonly CategoryIcon: LucideIcon
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}): ReactElement {
  const categoryName = category?.name ?? 'Categoría desconocida'
  const categoryColor = category?.color ?? colorForCategoryName(categoryName)

  const content = (
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
          <span className="text-foreground truncate font-medium">
            {expense.name}
          </span>
          <span className="font-display text-foreground text-lg">
            {formatCurrency(expense.price)}
          </span>
        </div>
        <div className="text-muted-foreground flex flex-wrap gap-x-1.5 text-xs">
          <span>{categoryName}</span>
          <span aria-hidden="true">·</span>
          <span>{formatShortDate(expense.expenseDate)}</span>
          <span aria-hidden="true">·</span>
          <span>{expense.authorDisplayName}</span>
        </div>
      </div>
    </>
  )

  // Same buttonless-card treatment as Home's movements list: tapping the row
  // opens it for editing, and there is no per-row delete affordance.
  return (
    <li>
      {onEditExpense !== undefined ? (
        <button
          type="button"
          className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
          aria-label={`Editar ${expense.name}`}
          onClick={() => {
            onEditExpense(expense, category?.name ?? '')
          }}
        >
          {content}
        </button>
      ) : (
        <div className="bg-card shadow-resting flex w-full items-center gap-3 rounded-2xl p-4">
          {content}
        </div>
      )}
    </li>
  )
}

export function ExpenseHistory({
  db,
  householdId,
  onEditExpense,
}: ExpenseHistoryProps): ReactElement {
  // useInfiniteQuery rather than manual page state: it keeps every loaded
  // page in one cache entry under the shared expenses prefix, so a mutation
  // anywhere in the app refetches the whole loaded history at once instead
  // of leaving older pages stale.
  const historyQuery = useInfiniteQuery({
    queryKey: expenseHistoryQueryKey({ householdId }),
    initialPageParam: null as Date | null,
    queryFn: async ({ pageParam }) => {
      const [page, categories] = await Promise.all([
        listExpenseHistoryPage({
          db,
          householdId,
          ...(pageParam === null ? {} : { beforeMonthStart: pageParam }),
        }),
        listCategories({ db, householdId }),
      ])
      return { ...page, categories }
    },
    getNextPageParam: (lastPage) => lastPage.nextBeforeMonthStart,
  })

  if (historyQuery.isPending) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (historyQuery.isError) {
    const message =
      historyQuery.error instanceof Error
        ? historyQuery.error.message
        : 'No se pudo cargar el histórico'
    return (
      <p role="alert" className="text-sm font-medium">
        {message}
      </p>
    )
  }

  const pages = historyQuery.data.pages
  const expenses = pages.flatMap((page) => page.expenses)
  const categories = pages[0]?.categories ?? []

  if (expenses.length === 0) {
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          Todavía no hay gastos
        </p>
      </div>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <div className="flex w-full flex-col gap-6">
      {groupByMonth(expenses).map((group) => (
        <section key={group.key} className="flex w-full flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-semibold">
            {group.label}
          </h2>
          <ul aria-label={group.label} className="flex flex-col gap-3 text-sm">
            {group.expenses.map((expense) => {
              const category = categoryById.get(expense.categoryId)
              return (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  category={category}
                  CategoryIcon={iconForCategoryName(
                    category?.name ?? 'Categoría desconocida',
                  )}
                  {...(onEditExpense === undefined ? {} : { onEditExpense })}
                />
              )
            })}
          </ul>
        </section>
      ))}
      {historyQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={historyQuery.isFetchingNextPage}
          onClick={() => {
            void historyQuery.fetchNextPage()
          }}
        >
          {historyQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
        </Button>
      ) : null}
    </div>
  )
}

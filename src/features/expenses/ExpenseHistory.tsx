import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { cssVars } from '@/lib/cssVars'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { membersQueryKey } from '@/features/household'
import {
  formatCurrency,
  isServicio,
  listCategories,
  listExpenseHistoryPage,
} from '@/lib/expenses'
import type { LucideIcon } from 'lucide-react'
import type { Category, Expense, ExpenseHistoryCursor } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatMonthLabel, formatDate } from '@/lib/format'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { expenseHistoryQueryKey } from './queryKeys'

export type ExpenseHistoryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}

type HistoryFilter = 'all' | 'servicio' | 'gasto'

const HISTORY_FILTERS: readonly { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'servicio', label: 'Servicios' },
  { value: 'gasto', label: 'Gastos' },
]

function matchesFilter(expense: Expense, filter: HistoryFilter): boolean {
  if (filter === 'servicio') {
    return isServicio(expense)
  }
  if (filter === 'gasto') {
    return !isServicio(expense)
  }
  return true
}

type MonthGroup = {
  readonly key: string
  readonly label: string
  readonly total: number
  readonly expenses: readonly Expense[]
}

// Pages are a fixed row count (listExpenseHistoryPage), not a calendar
// month, so a month CAN be split across two pages -- but grouping still
// works as a straight walk over the full accumulated list every render
// (see the `expenses` flatMap below), which is agnostic to where the page
// boundaries fell: consecutive same-month expenses merge into one group
// and get one header, whether they arrived in one page or two.
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
        total: last.total + expense.price,
        expenses: [...last.expenses, expense],
      }
      continue
    }
    groups.push({
      key,
      label: formatMonthLabel(expense.expenseDate),
      total: expense.price,
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
  authorDisplayName,
  onEditExpense,
}: {
  readonly expense: Expense
  readonly category: Category | undefined
  readonly CategoryIcon: LucideIcon
  readonly authorDisplayName: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}): ReactElement {
  const categoryName = category?.name ?? 'Categoría desconocida'
  const categoryColor = category?.color ?? colorForCategoryName(categoryName)

  const content = (
    <>
      <span
        aria-hidden="true"
        data-testid="category-icon"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
        style={cssVars({ '--swatch-color': categoryColor })}
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
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {/* "Servicio" marks an Expense created by paying a Pendiente
              (a bill), or one manually tagged as such (isService), so it
              reads apart from a plain Gasto logged directly -- there was
              previously no way to tell them apart in Histórico. */}
          {isServicio(expense) ? (
            <>
              <span className="bg-primary-subtle text-primary rounded-full px-2 py-0.5 text-xs font-semibold">
                Servicio
              </span>
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <CategoryBadge name={categoryName} color={categoryColor} />
          <span>{formatDate(expense.expenseDate)}</span>
          <span aria-hidden="true">·</span>
          <span>{authorDisplayName}</span>
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
          className="bg-card flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.98]"
          aria-label={`Editar ${expense.name}`}
          onClick={() => {
            onEditExpense(expense, category?.name ?? '')
          }}
        >
          {content}
        </button>
      ) : (
        <div className="bg-card flex w-full items-center gap-3 rounded-2xl p-4">
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
    initialPageParam: null as ExpenseHistoryCursor | null,
    queryFn: async ({ pageParam }) => {
      const [page, categories] = await Promise.all([
        listExpenseHistoryPage({
          db,
          householdId,
          ...(pageParam === null ? {} : { after: pageParam }),
        }),
        listCategories({ db, householdId }),
      ])
      return { ...page, categories }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
  // Resolved live rather than trusting each Expense's stored
  // authorDisplayName, which is a snapshot from creation/last reassignment
  // and goes stale once someone corrects their name in Ajustes -- see the
  // matching comment in RecentExpensesList.
  const membersQuery = useQuery({
    queryKey: membersQueryKey({ householdId }),
    queryFn: () => listHouseholdMembers({ db, householdId }),
  })
  const [filter, setFilter] = useState<HistoryFilter>('all')

  if (historyQuery.isPending || membersQuery.isPending) {
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="flex w-full flex-col gap-8"
      >
        <span className="sr-only">Cargando…</span>
        <div className="flex w-full flex-col gap-3">
          <Skeleton className="h-4 w-32" />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-card flex w-full items-center gap-3 rounded-2xl p-4"
            >
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (historyQuery.isError || membersQuery.isError) {
    const failed = historyQuery.isError
      ? historyQuery.error
      : membersQuery.error
    const message =
      failed instanceof Error
        ? failed.message
        : 'No se pudo cargar el histórico'
    return <AlertMessage>{message}</AlertMessage>
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
  const memberById = new Map<string, HouseholdMember>(
    membersQuery.data.map((member) => [member.userId, member]),
  )
  // Filtered client-side against whatever pages are already loaded, not a
  // separate query -- this app's data volume doesn't warrant a second
  // server-side query path, and "Cargar más" already exists to pull in more
  // if the current filter comes up short.
  const filteredExpenses = expenses.filter((expense) =>
    matchesFilter(expense, filter),
  )
  const monthGroups = groupByMonth(filteredExpenses)

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Per direct feedback: no way to separate what a household pays as a
          recurring bill (Servicio) from a one-off, in-the-moment purchase
          (Gasto) -- each month's total below already updates for whichever
          is selected, since it's computed from the filtered list. */}
      <div
        role="tablist"
        aria-label="Filtrar histórico"
        // A segmented control, not three separate buttons: one track holding
        // the three, with the selected one filled inside it. Three outlined
        // pills in a row read as three unrelated actions -- this reads as
        // one choice with three positions, which is what it is. Per direct
        // feedback. Inactive labels clear AA on the track (4.95:1), the
        // selected one on its fill (5.71:1).
        className="bg-muted flex w-full gap-1 rounded-full p-1"
      >
        {HISTORY_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => {
              setFilter(value)
            }}
            className={cn(
              'focus-visible:ring-ring/50 h-9 flex-1 rounded-full text-sm font-medium transition-colors outline-none focus-visible:ring-3',
              filter === value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {monthGroups.length === 0 ? (
        <p role="status" className="text-sm font-medium">
          {filter === 'servicio'
            ? 'No hay servicios en tu histórico'
            : 'No hay gastos sueltos en tu histórico'}
        </p>
      ) : null}
      {monthGroups.map((group, index) => {
        // Every group except possibly the last is guaranteed complete: pages
        // arrive strictly newest-first, so once a *different* month's row
        // has loaded, every row of an earlier month is provably already in.
        // Only the very last month currently on screen can still have more
        // of itself sitting behind "Cargar más" -- showing a running total
        // for it would undercount until that's loaded too.
        const isLastGroup = index === monthGroups.length - 1
        const totalMayGrow = isLastGroup && historyQuery.hasNextPage

        return (
          <section key={group.key} className="flex w-full flex-col gap-3">
            {/* The month's own total sits in its header. A history that only
                lists rows makes "what did we spend in July" a manual sum. */}
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-muted-foreground text-sm font-semibold">
                {group.label}
              </h2>
              {totalMayGrow ? null : (
                <span className="text-foreground shrink-0 text-sm font-semibold">
                  {formatCurrency(group.total)}
                </span>
              )}
            </div>
            <ul
              aria-label={group.label}
              className="flex flex-col gap-3 text-sm"
            >
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
                    authorDisplayName={
                      memberById.get(expense.memberId)?.displayName ??
                      expense.authorDisplayName
                    }
                    {...(onEditExpense === undefined ? {} : { onEditExpense })}
                  />
                )
              })}
            </ul>
          </section>
        )
      })}
      {historyQuery.hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="mx-auto px-8"
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

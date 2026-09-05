import { useQuery } from '@tanstack/react-query'
import { TintedBadge } from '@/components/CategoryBadge'
import { MovementCard } from '@/components/MovementCard'
import { Button } from '@/components/ui/button'
import { AlertMessage } from '@/components/ui/alert-message'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { membersQueryKey } from '@/features/household'
import {
  currentMonthRange,
  formatCurrency,
  isServicio,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import type { Category, Expense } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { paidDateLabel } from '@/lib/format'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
import { EmptyExpensesIllustration } from './EmptyExpensesIllustration'
import { MonthPager } from './MonthPager'
import { categoriesQueryKey, expensesInMonthQueryKey } from './queryKeys'

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

const FILTER_TOTAL_LABEL: Readonly<Record<HistoryFilter, string>> = {
  all: 'Total del mes',
  servicio: 'Total en servicios',
  gasto: 'Total en gastos',
}

function matchesFilter(expense: Expense, filter: HistoryFilter): boolean {
  if (filter === 'servicio') {
    return isServicio(expense)
  }
  if (filter === 'gasto') {
    return !isServicio(expense)
  }
  return true
}

function ExpenseRow({
  expense,
  category,
  authorDisplayName,
  onEditExpense,
}: {
  readonly expense: Expense
  readonly category: Category | undefined
  readonly authorDisplayName: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
}): ReactElement {
  const categoryName = category?.name ?? 'Categoría desconocida'
  const categoryColor = category?.color ?? colorForCategoryName(categoryName)

  // The same card a bill wears on Servicios: a movement in the history and
  // the bill it settled are the same thing at two moments, so they read the
  // same way. Per direct feedback -- and editing is now a button here too,
  // rather than the whole row being silently tappable.
  return (
    <li>
      <MovementCard
        categoryName={categoryName}
        categoryColor={categoryColor}
        CategoryIcon={iconForCategoryName(categoryName)}
        title={expense.name}
        when={paidDateLabel(expense.expenseDate)}
        meta={authorDisplayName}
        amount={
          <span className="font-display text-foreground text-lg">
            {formatCurrency(expense.price)}
          </span>
        }
        // "Servicio" marks an Expense created by paying a Pendiente (a
        // bill), or one manually tagged as such (isService), so it reads
        // apart from a plain Gasto logged directly.
        {...(isServicio(expense)
          ? { badge: <TintedBadge label="Servicio" color="#4e4c56" /> }
          : {})}
        {...(onEditExpense === undefined
          ? {}
          : {
              actions: (
                <div className="flex lg:shrink-0 lg:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full lg:w-32"
                    aria-label={`Editar ${expense.name}`}
                    onClick={() => {
                      onEditExpense(expense, category?.name ?? '')
                    }}
                  >
                    Editar
                  </Button>
                </div>
              ),
            })}
      />
    </li>
  )
}

export function ExpenseHistory({
  db,
  householdId,
  onEditExpense,
}: ExpenseHistoryProps): ReactElement {
  // One month at a time, paged by the same control Home and Servicios use,
  // rather than an endless cursor-walk behind "Cargar más". Per direct
  // feedback: a history is read a month at a time, and a month is also the
  // unit the total below is worth having.
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const { monthStart, monthEnd } = useMemo(
    () => currentMonthRange(viewedMonth),
    [viewedMonth],
  )
  // Same key shape every other month-scoped view uses, so this shares their
  // cache entry for the current month instead of fetching it again.
  const historyQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({ db, householdId, monthStart, monthEnd }),
  })
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
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

  // The pager and the tabs stay on screen while a month loads -- they are
  // this page's controls, and replacing them with a skeleton on every step
  // back through the year meant the way out vanished each time.
  const controls = (
    <>
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
      />
      {/* Per direct feedback: no way to separate what a household pays as a
          recurring bill (Servicio) from a one-off, in-the-moment purchase
          (Gasto) -- the total below updates for whichever is selected,
          since it's computed from the filtered list. */}
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
    </>
  )

  if (
    historyQuery.isPending ||
    membersQuery.isPending ||
    categoriesQuery.isPending
  ) {
    return (
      <div className="flex w-full flex-col gap-6">
        {controls}
        <div
          role="status"
          aria-label="Cargando…"
          className="flex w-full flex-col gap-3"
        >
          <span className="sr-only">Cargando…</span>
          <Skeleton className="h-6 w-40" />
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

  if (historyQuery.isError || membersQuery.isError || categoriesQuery.isError) {
    const failed = historyQuery.isError
      ? historyQuery.error
      : (membersQuery.error ?? categoriesQuery.error)
    const message =
      failed instanceof Error
        ? failed.message
        : 'No se pudo cargar el histórico'
    return (
      <div className="flex w-full flex-col gap-6">
        {controls}
        <AlertMessage>{message}</AlertMessage>
      </div>
    )
  }

  const expenses = historyQuery.data
  const categories = categoriesQuery.data

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  const memberById = new Map<string, HouseholdMember>(
    membersQuery.data.map((member) => [member.userId, member]),
  )
  // Filtered client-side against the month already in hand, not a second
  // server-side query path -- a household's month is a few dozen rows.
  const filteredExpenses = expenses.filter((expense) =>
    matchesFilter(expense, filter),
  )
  const total = filteredExpenses.reduce(
    (sum, expense) => sum + expense.price,
    0,
  )

  return (
    <div className="flex w-full flex-col gap-6">
      {controls}
      {/* The month's own total, for whichever of the three is selected --
          a history that only lists rows makes "what did we spend on
          servicios in July" a manual sum. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {FILTER_TOTAL_LABEL[filter]}
        </h2>
        <span className="font-display text-title text-foreground shrink-0">
          {formatCurrency(total)}
        </span>
      </div>
      {filteredExpenses.length === 0 ? (
        <div className="flex w-full flex-col items-center gap-4">
          <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
          <p role="status" className="text-sm font-medium">
            {filter === 'servicio'
              ? 'No hay servicios en este mes'
              : filter === 'gasto'
                ? 'No hay gastos sueltos en este mes'
                : 'No hay movimientos en este mes'}
          </p>
        </div>
      ) : (
        <ul
          aria-label="Movimientos del mes"
          className="flex flex-col gap-3 text-sm"
        >
          {filteredExpenses.map((expense) => {
            const category = categoryById.get(expense.categoryId)
            return (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                category={category}
                authorDisplayName={
                  memberById.get(expense.memberId)?.displayName ??
                  expense.authorDisplayName
                }
                {...(onEditExpense === undefined ? {} : { onEditExpense })}
              />
            )
          })}
        </ul>
      )}
    </div>
  )
}

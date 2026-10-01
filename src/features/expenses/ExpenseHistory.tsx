import { useQuery } from '@tanstack/react-query'
import { TintedBadge } from '@/components/CategoryBadge'
import { MovementCard } from '@/components/MovementCard'
import { Download, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertMessage } from '@/components/ui/alert-message'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { membersQueryKey } from '@/features/household'
import {
  csvFileNameForMonth,
  currentMonthRange,
  expensesToCsv,
  formatCurrency,
  isServicio,
  listCategories,
  listAllExpenses,
  listExpensesInMonth,
} from '@/lib/expenses'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
import { SearchInput } from '@/components/ui/search-input'
import { downloadTextFile } from '@/lib/download'
import type { Category, Expense } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { cardPurchaseMark } from '@/lib/cards'
import type { CardPurchase } from '@/lib/cards'
import { formatDate, paidDateLabel } from '@/lib/format'
import { listHouseholdMembers } from '@/lib/households'
import type { HouseholdMember, HouseholdsDb } from '@/lib/households'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { MonthPager } from './MonthPager'
import { newestFirst, useCardPurchasesInMonth } from './useCardPurchasesInMonth'
import type { MovementRow } from './useCardPurchasesInMonth'
import {
  allExpensesQueryKey,
  categoriesQueryKey,
  expensesInMonthQueryKey,
} from './queryKeys'

export type ExpenseHistoryProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onEditExpense?: (expense: Expense, categoryName: string) => void
  readonly onEditPurchase?: (
    purchase: CardPurchase,
    categoryName: string,
  ) => void
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-mini"
                  aria-label={`Editar ${expense.name}`}
                  onClick={() => {
                    onEditExpense(expense, category?.name ?? '')
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
              ),
            })}
      />
    </li>
  )
}

// Listed in its purchase month so the household sees what it bought, but
// never in the month's total: it counts through its Resúmenes.
function CardPurchaseRow({
  purchase,
  cardName,
  category,
  authorDisplayName,
  onEditPurchase,
}: {
  readonly purchase: CardPurchase
  readonly cardName: string
  readonly category: Category | undefined
  readonly authorDisplayName: string
  readonly onEditPurchase?: (
    purchase: CardPurchase,
    categoryName: string,
  ) => void
}): ReactElement {
  const categoryName = category?.name ?? 'Categoría desconocida'
  const categoryColor = category?.color ?? colorForCategoryName(categoryName)
  return (
    <li>
      <MovementCard
        categoryName={categoryName}
        categoryColor={categoryColor}
        CategoryIcon={iconForCategoryName(categoryName)}
        title={purchase.name}
        when={`Comprado el ${formatDate(purchase.purchaseDate)}`}
        meta={authorDisplayName}
        amount={
          <span className="font-display text-muted-foreground text-lg">
            {formatCurrency(purchase.total)}
          </span>
        }
        badge={
          <TintedBadge
            label={cardPurchaseMark(cardName, purchase.cuotas)}
            color="#4e4c56"
          />
        }
        {...(onEditPurchase === undefined
          ? {}
          : {
              actions: (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-mini"
                  aria-label={`Editar ${purchase.name}`}
                  onClick={() => {
                    onEditPurchase(purchase, category?.name ?? '')
                  }}
                >
                  <Pencil aria-hidden="true" />
                </Button>
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
  onEditPurchase,
}: ExpenseHistoryProps): ReactElement {
  // One month at a time, paged by the same control Home and Servicios use,
  // rather than an endless cursor-walk behind "Cargar más". Per direct
  // feedback: a history is read a month at a time, and a month is also the
  // unit the total below is worth having.
  // Categorías links here with ?month=YYYY-MM&category=<id>.
  const [params] = useSearchParams()
  const [viewedMonth, setViewedMonth] = useState(() => {
    const match = /^(\d{4})-(\d{2})$/.exec(params.get('month') ?? '')
    return match === null
      ? currentMonthRange().monthStart
      : currentMonthRange(new Date(Number(match[1]), Number(match[2]) - 1, 1))
          .monthStart
  })
  const [categoryFilter, setCategoryFilter] = useState(params.get('category'))
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
  const purchasesQuery = useCardPurchasesInMonth({
    db,
    householdId,
    monthStart,
    monthEnd,
  })
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [query, setQuery] = useState('')
  // Searching drops the month: see listExpenseHistoryForSearch for why a
  // search scoped to the month on screen is worse than none. Only fetched
  // once something is actually typed.
  const isSearching = query.trim() !== ''
  const searchQuery = useQuery({
    queryKey: allExpensesQueryKey({ householdId }),
    queryFn: () => listAllExpenses({ db, householdId }),
    enabled: isSearching,
  })
  // Nothing is "not found" until the history has actually arrived. Showing
  // the empty state while the fetch is still in flight told the household
  // its plomero did not exist, a second before producing it.
  const isSearchLoading = isSearching && searchQuery.data === undefined

  // The pager and the tabs stay on screen while a month loads -- they are
  // this page's controls, and replacing them with a skeleton on every step
  // back through the year meant the way out vanished each time.
  const controls = (
    <>
      <SearchInput
        label="Buscar movimientos"
        placeholder="Buscar por nombre, categoría o comentario"
        value={query}
        onChange={setQuery}
      />
      {/* The pager steps aside while searching: you are either reading a
          month or looking through everything, and a pager that did not
          change what is on screen would be a lie. Clearing the box brings
          back the month you were on. */}
      {isSearching ? null : (
        <MonthPager
          viewedMonth={viewedMonth}
          onViewedMonthChange={setViewedMonth}
        />
      )}
      {categoryFilter === null ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            setCategoryFilter(null)
          }}
        >
          {categoriesQuery.data?.find((c) => c.id === categoryFilter)?.name ??
            'Categoría'}{' '}
          ✕
        </Button>
      )}
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
    categoriesQuery.isPending ||
    purchasesQuery.isPending
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
  // Filtered client-side against whatever is in hand -- the month while
  // browsing, the whole history while searching. A household's month is a
  // few dozen rows and its history a few hundred; neither warrants a second
  // server-side query path.
  const searchable = isSearching ? (searchQuery.data ?? []) : expenses
  const filteredExpenses = searchable.filter(
    (expense) =>
      matchesFilter(expense, filter) &&
      (categoryFilter === null || expense.categoryId === categoryFilter) &&
      (!isSearching ||
        matchesSearch(query, [
          expense.name,
          categoryById.get(expense.categoryId)?.name,
          expense.comments,
        ])),
  )
  const total = filteredExpenses.reduce(
    (sum, expense) => sum + expense.price,
    0,
  )
  // A card purchase is a gasto of its month, never a servicio. Searching
  // covers Expenses only.
  // ponytail: search skips card purchases; add a household-wide purchases
  // read if people search for them.
  const shownPurchases =
    isSearching || filter === 'servicio' ? [] : purchasesQuery.purchases
  const rows: readonly MovementRow[] = [
    ...filteredExpenses.map((expense): MovementRow => ({
      kind: 'expense',
      expense,
      date: expense.expenseDate,
    })),
    ...shownPurchases.map((purchase): MovementRow => ({
      kind: 'purchase',
      purchase,
      date: purchase.purchaseDate,
    })),
  ].sort(newestFirst)

  return (
    <div className="flex w-full flex-col gap-6">
      {controls}
      {/* The whole month, not the selected tab: one file per month is what
          makes two months comparable in a spreadsheet, and a file named for
          September that held only its servicios would be a trap. Per direct
          feedback. */}
      <div className="flex w-full justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          // Nothing to export while searching: the list on screen spans
          // months, and a file named for one of them would not be it.
          disabled={expenses.length === 0 || isSearching}
          onClick={() => {
            downloadTextFile({
              fileName: csvFileNameForMonth(monthStart),
              text: expensesToCsv(
                expenses.map((expense) => ({
                  expense,
                  categoryName:
                    categoryById.get(expense.categoryId)?.name ??
                    'Categoría desconocida',
                  authorDisplayName:
                    memberById.get(expense.memberId)?.displayName ??
                    expense.authorDisplayName,
                  isServicio: isServicio(expense),
                })),
              ),
              mimeType: 'text/csv;charset=utf-8',
            })
          }}
        >
          <Download aria-hidden="true" />
          Exportar mes
        </Button>
      </div>
      {/* The month's own total, for whichever of the three is selected --
          a history that only lists rows makes "what did we spend on
          servicios in July" a manual sum. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {isSearching ? 'Total encontrado' : FILTER_TOTAL_LABEL[filter]}
        </h2>
        <span className="font-display text-title text-foreground shrink-0">
          {isSearchLoading ? '—' : formatCurrency(total)}
        </span>
      </div>
      {isSearchLoading ? (
        <div
          role="status"
          aria-label="Buscando…"
          className="flex w-full flex-col gap-3"
        >
          <span className="sr-only">Buscando…</span>
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
      ) : rows.length === 0 ? (
        isSearching ? (
          <EmptyState
            title="Sin resultados"
            description={`No encontramos nada para "${query.trim()}". Probá con otra palabra.`}
          />
        ) : filter === 'servicio' ? (
          <EmptyState
            illustration={ILLUSTRATIONS.celebrating}
            title="Ningún servicio este mes"
            description="Los servicios que paguen van quedando registrados acá."
          />
        ) : filter === 'gasto' ? (
          <EmptyState
            illustration={ILLUSTRATIONS.celebrating}
            title="Ningún gasto suelto este mes"
            description="Los gastos del día a día aparecen acá apenas los carguen."
          />
        ) : (
          <EmptyState
            illustration={ILLUSTRATIONS.celebrating}
            title="Mes sin movimientos"
            description="Acá va quedando todo: los gastos sueltos y los servicios que paguen."
          />
        )
      ) : (
        <ul
          aria-label={
            isSearching ? 'Resultados de la búsqueda' : 'Movimientos del mes'
          }
          className="flex flex-col gap-3 text-sm"
        >
          {rows.map((row) => {
            if (row.kind === 'purchase') {
              return (
                <CardPurchaseRow
                  key={`purchase-${row.purchase.id}`}
                  purchase={row.purchase}
                  cardName={
                    purchasesQuery.cardNameById.get(row.purchase.cardId) ??
                    'Tarjeta'
                  }
                  category={categoryById.get(row.purchase.categoryId)}
                  authorDisplayName={
                    memberById.get(row.purchase.memberId)?.displayName ??
                    row.purchase.authorDisplayName
                  }
                  {...(onEditPurchase === undefined ? {} : { onEditPurchase })}
                />
              )
            }
            const { expense } = row
            return (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                category={categoryById.get(expense.categoryId)}
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

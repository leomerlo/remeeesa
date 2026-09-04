import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { cssVars } from '@/lib/cssVars'
import { CategoryBadge } from '@/components/CategoryBadge'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { listPendientesForMonth, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { EmptyExpensesIllustration } from '@/features/expenses'
import {
  currentMonthRange,
  formatBudgetAmount,
  listCategories,
} from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'
import { AlertMessage } from '@/components/ui/alert-message'

export type PendientesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Defaults to the current month. PendientesPage passes whichever month its
  // MonthPager is on, so this screen reads one month at a time.
  readonly monthStart?: Date
  readonly monthEnd?: Date
  readonly onEditPendiente?: (
    pendiente: Pendiente,
    categoryName: string,
  ) => void
  readonly onMarkPaid?: (pendiente: Pendiente, categoryName: string) => void
}

export function PendientesList({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
  onEditPendiente,
  onMarkPaid,
}: PendientesListProps): ReactElement {
  // One month at a time, split in two: what is still owed for it, then what
  // was already paid in it. Reading a single list that mixed months and
  // states was the confusion -- a due date on its own does not say whether
  // it is behind you. Per direct feedback.
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  const pendientesQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), monthStart.getTime()],
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientesForMonth({ db, householdId, monthStart, monthEnd }),
        listCategories({ db, householdId }),
      ])
      return { pendientes, categories }
    },
  })

  if (pendientesQuery.isPending) {
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="flex w-full flex-col gap-3 text-sm"
      >
        <span className="sr-only">Cargando…</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-card flex flex-col gap-3 rounded-2xl p-4">
            <div className="flex w-full items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        ))}
      </div>
    )
  }

  if (pendientesQuery.isError) {
    const message =
      pendientesQuery.error instanceof Error
        ? pendientesQuery.error.message
        : 'No se pudieron cargar los pendientes'
    return <AlertMessage>{message}</AlertMessage>
  }

  const { pendientes, categories } = pendientesQuery.data
  // The query hands back every still-pending bill regardless of due date
  // plus whatever was paid inside this month; the first half is narrowed to
  // the month here, the second is already scoped by the query.
  const stillOwed = pendientesDueInMonth(pendientes, monthStart, monthEnd)
  const alreadyPaid = pendientes.filter(
    (pendiente) => pendiente.status === 'paid',
  )
  if (stillOwed.length === 0 && alreadyPaid.length === 0) {
    // The mascot-with-notepad illustration every other empty state on the
    // app uses (Home's movements list, Histórico) -- plain text here was the
    // one empty state with no illustration at all. The month pager above
    // already says which month is empty, so this does not repeat it.
    return (
      <div className="flex w-full flex-col items-center gap-4">
        <EmptyExpensesIllustration className="mx-auto h-32 w-40" />
        <p role="status" className="text-sm font-medium">
          No hay servicios en este mes
        </p>
      </div>
    )
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  function renderRow(pendiente: Pendiente): ReactElement {
    const category = categoryById.get(pendiente.categoryId)
    const categoryName = category?.name ?? 'Categoría desconocida'
    const categoryColor = category?.color ?? colorForCategoryName(categoryName)

    const CategoryIcon = iconForCategoryName(categoryName)

    const amount =
      pendiente.expectedAmount !== null ? (
        <span className="font-display text-lg text-foreground">
          {formatBudgetAmount(pendiente.expectedAmount)}
        </span>
      ) : pendiente.recurring ? (
        // A recurring bill with no amount yet reads as incomplete/broken
        // with nothing where a price usually is -- a placeholder says
        // "not filled in yet" instead of looking like a rendering bug. A
        // one-off Pendiente with no amount is a different, deliberate
        // case (see AddPendienteForm's "Monto esperado" comment) and
        // stays blank.
        <span className="font-display text-muted-foreground text-lg">
          $ --,--
        </span>
      ) : null

    // Name, then what and when, then the amount underneath -- per direct
    // feedback. The amount used to sit off on the right on the name's
    // line, which made the row read as two unrelated halves and left the
    // name truncating early to make room for it. Reading down the column
    // now answers "what is this / when is it / how much" in that order,
    // and the name gets the full width and a size to match its job.
    const isPaid = pendiente.status === 'paid'

    const rowContent = (
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          data-testid="category-icon"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
          style={cssVars({ '--swatch-color': categoryColor })}
        >
          <CategoryIcon className="size-5 text-white" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-lg font-semibold text-foreground">
            {pendiente.name}
          </span>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <CategoryBadge name={categoryName} color={categoryColor} />
            <span>{formatDate(pendiente.dueDate)}</span>
            {isPaid ? (
              <span className="text-success inline-flex items-center gap-1 font-semibold">
                <Check className="size-3.5" aria-hidden="true" />
                Pagado
              </span>
            ) : null}
          </div>
          {amount}
        </div>
      </div>
    )

    // Both actions are spelled out on their own row under the name.
    // "Editar" used to be the whole row being secretly tappable, which
    // is not an affordance anyone can see; and "Pagar" carried the same
    // weight as everything else on the card. Per direct feedback: the
    // two actions are Pagar and Editar, and Pagar is the primary one.
    // They sit under the name rather than beside the amount because
    // sharing that line truncated names like "Expensas" to "Expen…" at
    // 375px.
    // A paid row keeps Editar -- that is the way back from a mistaken
    // payment -- but not Pagar, which has nothing left to do.
    const canMarkPaid = onMarkPaid !== undefined && !isPaid
    const actions =
      !canMarkPaid && onEditPendiente === undefined ? null : (
        <div className="flex gap-2 lg:shrink-0 lg:justify-end">
          {canMarkPaid ? (
            <Button
              type="button"
              className="flex-1 lg:w-32 lg:flex-none"
              aria-label={`Marcar pagado ${pendiente.name}`}
              onClick={() => {
                onMarkPaid?.(pendiente, category?.name ?? '')
              }}
            >
              Pagar
            </Button>
          ) : null}
          {onEditPendiente !== undefined ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1 lg:w-32 lg:flex-none"
              aria-label={`Editar ${pendiente.name}`}
              onClick={() => {
                onEditPendiente(pendiente, category?.name ?? '')
              }}
            >
              Editar
            </Button>
          ) : null}
        </div>
      )

    return (
      <li key={pendiente.id}>
        {/* Stacked on a phone, one row from `lg`. In a row everything
            centres against the card's own height, so the icon and the two
            buttons line up with the middle of the block of text rather than
            with its first line. */}
        <div className="bg-card flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:gap-4">
          {rowContent}
          {actions}
        </div>
      </li>
    )
  }

  return (
    <div className="flex w-full flex-col gap-8 text-sm">
      {/* Group labels, not titles. At the section size they were a third
          heading in a row of three -- page name, month, group -- all at
          much the same weight, so nothing said which was which. Smaller and
          quieter puts them below the month they belong to. */}
      {stillOwed.length > 0 ? (
        <section
          aria-labelledby="por-pagar-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="por-pagar-heading"
            className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
          >
            Por pagar
          </h2>
          <ul aria-label="Servicios por pagar" className="flex flex-col gap-3">
            {stillOwed.map(renderRow)}
          </ul>
        </section>
      ) : null}
      {alreadyPaid.length > 0 ? (
        <section
          aria-labelledby="pagados-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="pagados-heading"
            className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
          >
            Pagados
          </h2>
          <ul aria-label="Servicios pagados" className="flex flex-col gap-3">
            {alreadyPaid.map(renderRow)}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

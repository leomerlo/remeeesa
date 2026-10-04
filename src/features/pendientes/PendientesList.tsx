import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { TintedBadge } from '@/components/CategoryBadge'
import { MovementCard } from '@/components/MovementCard'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { listPendientesForMonth, pendientesDueInMonth } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { currentMonthRange, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { dueDateLabel, isOverdue, paidDateLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { PendienteAmount } from './PendienteAmount'
import { pendientesQueryKey } from './queryKeys'
import { ResumenSheet, resumenLabel } from './ResumenSheet'
import { AlertMessage } from '@/components/ui/alert-message'

// The same three-way shape Histórico's filter has, so both list screens
// read identically: everything, or one of the two halves. It replaced a pair
// of "POR PAGAR" / "PAGADOS" group headings -- per direct feedback the two
// screens should differ in their rows, not in how they are steered.
export type PendientesFilter = 'all' | 'pendiente' | 'pagado'

export const PENDIENTES_FILTERS: readonly {
  readonly value: PendientesFilter
  readonly label: string
}[] = [
  { value: 'all', label: 'Todos' },
  { value: 'pendiente', label: 'Por pagar' },
  { value: 'pagado', label: 'Pagados' },
]

export type PendientesListProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Who pays a Resumen opened from here.
  readonly memberId: string
  readonly authorDisplayName: string
  // Defaults to the current month. PendientesPage passes whichever month its
  // MonthPager is on, so this screen reads one month at a time.
  readonly monthStart?: Date
  readonly monthEnd?: Date
  // Owned by the page rather than here, so its box can sit above the month
  // pager -- the pager steps aside while searching, and a box below it
  // would jump up the screen when it did.
  readonly query?: string
  // Which of the month's servicios to show. Owned by the page, the same way
  // the query is, so it can sit in the page's toolbar beside the month --
  // the two together are what decides the list.
  readonly filter?: PendientesFilter
  readonly onEditPendiente?: (
    pendiente: Pendiente,
    categoryName: string,
  ) => void
  readonly onMarkPaid?: (pendiente: Pendiente, categoryName: string) => void
  // Opens the page's add form, and clears the page's search box, from the
  // two empty states below. Both optional: the page owns the state, so a
  // caller that does not pass them simply gets an empty state with no
  // button rather than one that does nothing.
  readonly onAddPendiente?: () => void
  readonly onClearQuery?: () => void
}

export function PendientesList({
  db,
  householdId,
  memberId,
  authorDisplayName,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
  query = '',
  filter = 'all',
  onEditPendiente,
  onMarkPaid,
  onAddPendiente,
  onClearQuery,
}: PendientesListProps): ReactElement {
  // One month at a time, split in two: what is still owed for it, then what
  // was already paid in it. Reading a single list that mixed months and
  // states was the confusion -- a due date on its own does not say whether
  // it is behind you. Per direct feedback.
  const isSearching = query.trim() !== ''
  const [openResumen, setOpenResumen] = useState<Pendiente | null>(null)
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
        : 'No se pudieron cargar los servicios'
    return <AlertMessage>{message}</AlertMessage>
  }

  const { pendientes, categories } = pendientesQuery.data
  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )
  // The query hands back every still-pending bill regardless of due date
  // plus whatever was paid inside this month; the first half is narrowed to
  // the month here, the second is already scoped by the query.
  // Searching drops the month here too, but it reaches less far than
  // Histórico's does and it should: the query already holds every bill that
  // is still owed, whatever month it falls in, plus this month's settled
  // ones. A bill paid back in July is not here -- it is in Histórico, as
  // the expense it became, where the search does cover everything.
  const matches = (pendiente: Pendiente): boolean =>
    matchesSearch(query, [
      pendiente.name,
      categoryById.get(pendiente.categoryId)?.name,
    ])
  const stillOwed =
    filter === 'pagado'
      ? []
      : (isSearching
          ? pendientes.filter((pendiente) => pendiente.status === 'pending')
          : pendientesDueInMonth(pendientes, monthStart, monthEnd)
        ).filter(matches)
  const alreadyPaid =
    filter === 'pendiente'
      ? []
      : pendientes
          .filter((pendiente) => pendiente.status === 'paid')
          .filter(matches)
  if (stillOwed.length === 0 && alreadyPaid.length === 0) {
    // The month pager above already says which month is empty, so this does
    // not repeat it. The piggy-bank drawing rather than the notepad every
    // other screen used: a servicio is money put aside for something that
    // comes back, not a note you jot down.
    return isSearching ? (
      <EmptyState
        title="Sin resultados"
        description={`No encontramos nada para "${query.trim()}". Probá con otra palabra.`}
        {...(onClearQuery === undefined
          ? {}
          : {
              action: (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    onClearQuery()
                  }}
                >
                  Limpiar la búsqueda
                </Button>
              ),
            })}
      />
    ) : (
      <EmptyState
        illustration={ILLUSTRATIONS.saving}
        title="Ningún servicio este mes"
        description="Alquiler, internet, expensas: lo que vuelve todos los meses va acá."
        {...(onAddPendiente === undefined
          ? {}
          : {
              action: (
                <Button
                  type="button"
                  onClick={() => {
                    onAddPendiente()
                  }}
                >
                  <Plus aria-hidden="true" />
                  Agregar un servicio
                </Button>
              ),
            })}
      />
    )
  }

  function renderRow(pendiente: Pendiente): ReactElement {
    const category = categoryById.get(pendiente.categoryId)
    const categoryName = category?.name ?? 'Categoría desconocida'
    const categoryColor = category?.color ?? colorForCategoryName(categoryName)
    const isPaid = pendiente.status === 'paid'
    const overdue = !isPaid && isOverdue(pendiente.dueDate)

    const amount = <PendienteAmount pendiente={pendiente} />

    // A paid row keeps Editar -- that is the way back from a mistaken
    // payment -- but not Pagar, which has nothing left to do. Pagar stays a
    // real button because it is what this screen exists for; Editar is a
    // pencil against the right edge, the same one Histórico and Categorías
    // use, so the three lists agree. Per direct feedback.
    // A card's Resumen gets its own pay and view flow, never the generic
    // Pendiente form both of these open -- so neither shows on one.
    const isResumen = pendiente.cardId !== undefined
    const canMarkPaid = onMarkPaid !== undefined && !isPaid && !isResumen
    const canEdit = onEditPendiente !== undefined && !isResumen
    const actions =
      !canMarkPaid && !canEdit && !isResumen ? null : (
        // Editar first, then the one that does something to the money:
        // the destructive-ish, committing action sits furthest from the
        // thumb's resting edge and reads last. Per direct feedback.
        <>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Editar ${pendiente.name}`}
              onClick={() => {
                onEditPendiente?.(pendiente, category?.name ?? '')
              }}
            >
              <Pencil aria-hidden="true" />
              Editar
            </Button>
          ) : null}
          {canMarkPaid ? (
            <Button
              type="button"
              size="sm"

              aria-label={`Marcar pagado ${pendiente.name}`}
              onClick={() => {
                onMarkPaid?.(pendiente, category?.name ?? '')
              }}
            >
              Pagar
            </Button>
          ) : null}
          {isResumen ? (
            <Button
              type="button"
              size="sm"
              variant="outline"

              aria-label={`Ver ${resumenLabel(pendiente)}`}
              onClick={() => {
                setOpenResumen(pendiente)
              }}
            >
              Ver
            </Button>
          ) : null}
        </>
      )

    return (
      <li key={pendiente.id}>
        <MovementCard
          categoryName={categoryName}
          categoryColor={categoryColor}
          CategoryIcon={iconForCategoryName(categoryName)}
          // The bank settles this one on its own, and at whatever figure it
          // actually is -- the amount here is last cycle's, carried over. So
          // the badge says both things: you do not have to pay it, and the
          // number is worth a look.
          {...(pendiente.autoDebit
            ? {
                badge: (
                  <TintedBadge
                    label="Débito automático · revisar monto"
                    color="#4e4c56"
                  />
                ),
              }
            : {})}
          title={pendiente.name}
          when={
            isPaid
              ? paidDateLabel(pendiente.paidAt ?? pendiente.dueDate)
              : dueDateLabel(pendiente.dueDate)
          }
          isOverdue={overdue}
          amount={amount}
          {...(actions === null ? {} : { actions })}
        />
      </li>
    )
  }

  const showGroupLabels = stillOwed.length > 0 && alreadyPaid.length > 0

  return (
    <div className="flex w-full flex-col gap-8 text-sm">
      <ResumenSheet
        db={db}
        householdId={householdId}
        memberId={memberId}
        authorDisplayName={authorDisplayName}
        resumen={openResumen}
        onClose={() => {
          setOpenResumen(null)
        }}
      />
      {/* Group labels, not titles, and only while both groups are on
          screen: with the filter narrowed to one of them the heading only
          repeats the word already showing in the filter.

          At the section size they used to be a third heading in a row of
          three -- page name, month, group -- all at much the same weight, so
          nothing said which was which. Smaller and
          quieter puts them below the month they belong to. */}
      {stillOwed.length > 0 ? (
        <section
          {...(showGroupLabels
            ? { 'aria-labelledby': 'por-pagar-heading' }
            : { 'aria-label': 'Servicios por pagar' })}
          className="flex flex-col gap-3"
        >
          {showGroupLabels ? (
            <h2
              id="por-pagar-heading"
              className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
            >
              Por pagar
            </h2>
          ) : null}
          {/* One per row at every width. This is a list you read down, the
              same as Histórico -- two columns turned it into a board. Per
              direct feedback. */}
          <ul aria-label="Servicios por pagar" className="flex flex-col gap-3">
            {stillOwed.map(renderRow)}
          </ul>
        </section>
      ) : null}
      {alreadyPaid.length > 0 ? (
        <section
          {...(showGroupLabels
            ? { 'aria-labelledby': 'pagados-heading' }
            : { 'aria-label': 'Servicios pagados' })}
          className="flex flex-col gap-3"
        >
          {showGroupLabels ? (
            <h2
              id="pagados-heading"
              className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
            >
              Pagados
            </h2>
          ) : null}
          <ul aria-label="Servicios pagados" className="flex flex-col gap-3">
            {alreadyPaid.map(renderRow)}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

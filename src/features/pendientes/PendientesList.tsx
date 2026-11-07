import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { TintedBadge } from '@/components/CategoryBadge'
import { MovementCard } from '@/components/MovementCard'
import { CardsSummaryCard } from './CardsSummaryCard'
import { matchesSearch } from '@/lib/search/fuzzyMatch'
import { Pencil, Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isBillToPay,
  listPendientesForMonth,
  listRecurrentesToCarry,
  pendientesDueInMonth,
} from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { currentMonthRange, listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import {
  dueDateLabel,
  formatMonthLabel,
  isOverdue,
  paidDateLabel,
} from '@/lib/format'
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
  // Opens the page's "Traer del mes pasado" sheet from the empty state.
  readonly onCarryFromLastMonth?: () => void
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
  onCarryFromLastMonth,
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
  // What last month has that could come into this one. Read here only to
  // say so in the empty state: a new month starts with nothing and gives no
  // hint that last month's bills are one tap away, while "Traer del mes
  // pasado" sits in the toolbar as an icon. Per direct feedback: todas las
  // acciones que el usuario tiene que hacer tienen que estar expuestas.
  // Same query key as the sheet's own, so opening it costs no second read.
  const toCarryQuery = useQuery({
    queryKey: [
      ...pendientesQueryKey({ householdId }),
      'to-carry',
      monthStart.getTime(),
    ],
    queryFn: () => listRecurrentesToCarry({ db, householdId, monthStart }),
    enabled: !isSearching,
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
  // Three groups, not two. A card's Resumen whose statement has not
  // arrived is pending but owes nothing and cannot be paid, so listing it
  // under "Por pagar" said the opposite of what the app means by it --
  // Home stopped doing that and this screen had not caught up. Per direct
  // feedback: me cuesta mucho interpretar esta situación.
  const pendingThisMonth =
    filter === 'pagado'
      ? []
      : (isSearching
          ? pendientes.filter((pendiente) => pendiente.status === 'pending')
          : pendientesDueInMonth(pendientes, monthStart, monthEnd)
        ).filter(matches)
  const stillOwed = pendingThisMonth.filter(isBillToPay)
  const waiting = pendingThisMonth.filter(
    (pendiente) => !isBillToPay(pendiente),
  )
  const alreadyPaid =
    filter === 'pendiente'
      ? []
      : pendientes
          .filter((pendiente) => pendiente.status === 'paid')
          .filter(matches)
  const previousMonth = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() - 1,
    1,
  )
  const toCarry = (toCarryQuery.data ?? []).filter((row) => !row.alreadyThere)
  // Offered wherever the month has no bills of its own -- which is not the
  // same as an empty screen: next month's card estimates appear by
  // themselves, so a month nobody has filled in yet still has rows in it.
  const carryButton =
    isSearching ||
    toCarry.length === 0 ||
    onCarryFromLastMonth === undefined ? null : (
      <Button
        type="button"
        onClick={() => {
          onCarryFromLastMonth()
        }}
      >
        <Repeat aria-hidden="true" />
        {/* The same words as the toolbar button, so the two read as one
            action. The count and the month are in the line above it. */}
        Traer del mes pasado
      </Button>
    )
  const carryLine = `En ${formatMonthLabel(previousMonth)} cargaste ${
    toCarry.length === 1 ? '1 cuenta' : `${String(toCarry.length)} cuentas`
  }. Traelas y ajustás los montos.`

  if (
    stillOwed.length === 0 &&
    waiting.length === 0 &&
    alreadyPaid.length === 0
  ) {
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
        description={
          carryButton === null
            ? 'Alquiler, internet, expensas: lo que vuelve todos los meses va acá.'
            : carryLine
        }
        {...(carryButton === null && onAddPendiente === undefined
          ? {}
          : {
              action: (
                <div className="flex flex-col items-stretch gap-2">
                  {carryButton}
                  {onAddPendiente === undefined ? null : (
                    <Button
                      type="button"
                      variant={carryButton === null ? 'default' : 'outline'}
                      onClick={() => {
                        onAddPendiente()
                      }}
                    >
                      <Plus aria-hidden="true" />
                      Agregar un servicio
                    </Button>
                  )}
                </div>
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
          // A Resumen with no statement loaded has no due date to show:
          // the app gives every one of them the 10th, which for something
          // that has not arrived is a confident-looking invention. What it
          // does have is a month it came from, which is the thing nobody
          // was ever told. Per direct feedback.
          when={
            isPaid
              ? paidDateLabel(pendiente.paidAt ?? pendiente.dueDate)
              : isBillToPay(pendiente)
                ? dueDateLabel(pendiente.dueDate)
                : `Lo que compraste en ${formatMonthLabel(
                    new Date(
                      pendiente.dueDate.getFullYear(),
                      pendiente.dueDate.getMonth() - 1,
                      1,
                    ),
                  )}`
          }
          isOverdue={overdue}
          amount={amount}
          {...(actions === null ? {} : { actions })}
        />
      </li>
    )
  }

  // Headings earn their place once there is more than one group to tell
  // apart; the waiting one always carries its own, because what it holds
  // needs saying whether or not anything else is on screen.
  const showGroupLabels =
    [stillOwed, waiting, alreadyPaid].filter((group) => group.length > 0)
      .length > 1

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
      {waiting.length === 0 ? null : (
        <section
          aria-labelledby="resumen-tarjetas-heading"
          className="flex flex-col gap-3"
        >
          <h2
            id="resumen-tarjetas-heading-group"
            className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
          >
            Resumen de tarjetas
          </h2>
          {/* One card for every statement still waiting, not one row each:
              four rows for two cards, each labelled ESTIMADO with an
              invented due date, was the shape that made this impossible to
              read. Same block Home uses, and it opens into the same
              consumos. Per direct feedback. */}
          <CardsSummaryCard
            db={db}
            householdId={householdId}
            resumenes={waiting}
            categories={categories}
            title="Lo que van a pedir las tarjetas"
            subtitle="Tocá para ver los consumos"
            headingId="resumen-tarjetas-heading"
            detailTitle={`Tarjetas de ${formatMonthLabel(monthStart)}`}
            // This is the month on screen, so these are bills that can be
            // paid -- and this block is now the only place they live.
            onPay={setOpenResumen}
          />
          {/* Under the card rather than inside it: at phone width a
              sentence this long wrapped to four lines and squashed the
              figure it was explaining. It is also the sentence the app
              never said out loud, so it gets its own line. */}
          <p className="text-muted-foreground text-sm">
            Es la suma de lo que fuiste cargando, así que no se debe ni se
            descuenta del mes. Cuando pagues una tarjeta, abrila y poné lo que
            te cobró el banco.
          </p>
        </section>
      )}
      {/* A month nobody has filled in yet is rarely empty: next month's card
          estimates land in it on their own, so the empty state below never
          shows and "Traer del mes pasado" stayed an icon in the toolbar.
          Per direct feedback: todas las acciones que el usuario tiene que
          hacer tienen que estar expuestas. */}
      {carryButton !== null &&
      stillOwed.length === 0 &&
      alreadyPaid.length === 0 ? (
        <section
          aria-label="Traer servicios del mes pasado"
          className="bg-card card-surface flex flex-col items-start gap-3 rounded-2xl p-4"
        >
          <div className="flex flex-col gap-1">
            <p className="font-semibold">
              Todavía no cargaste servicios de {formatMonthLabel(monthStart)}
            </p>
            <p className="text-muted-foreground text-sm">{carryLine}</p>
          </div>
          {carryButton}
        </section>
      ) : null}
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

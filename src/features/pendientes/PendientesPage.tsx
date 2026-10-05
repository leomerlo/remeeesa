import { useRef, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { PageHeader } from '@/components/PageHeader'
import { AddPendienteSheet } from './AddPendienteSheet'
import { CarryRecurrentesSheet } from './CarryRecurrentesSheet'
import type { EditPendienteTarget } from './AddPendienteForm'
import { MonthPager } from '@/features/expenses'
import { SearchInput } from '@/components/ui/search-input'
import { currentMonthRange } from '@/lib/expenses'
import { PendientesList, PENDIENTES_FILTERS } from './PendientesList'
import type { PendientesFilter } from './PendientesList'
import { FilterTabs } from '@/components/ui/filter-tabs'
import { PageToolbar } from '@/components/ui/page-toolbar'

export type PendientesPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function PendientesPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: PendientesPageProps): ReactElement {
  const { currentUserId, db, membership } = useHouseholdMembership({
    currentUserId: currentUserIdProp,
    householdsDb,
  })
  const [isAddPendienteSheetOpen, setIsAddPendienteSheetOpen] = useState(false)
  // Owned here rather than inside MonthPager so the list below moves with
  // it, the same way Home's MonthNavigator drives every section on that
  // page.
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PendientesFilter>('all')
  const isSearching = query.trim() !== ''
  const [viewedMonth, setViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  if (currentUserId === undefined) {
    return <LoadingIndicator />
  }

  if (currentUserId === null) {
    return <Navigate to="/" replace />
  }

  if (membership === undefined) {
    return <LoadingIndicator />
  }

  if (membership === null) {
    return <Navigate to="/" replace />
  }

  // The household member's own editable name (set in Ajustes), not the raw
  // Firebase Auth profile -- see HomePage's identical fix for why.
  const authorDisplayName = membership.displayName
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)

  return (
    <div className="flex w-full flex-col gap-8">
      {/* Stacked on a phone -- the button is full-width there and wants its
          own line. On a wide window a full-width title with a button on the
          line below it wastes the whole right half of the screen, so the
          two share one row. */}
      {/* Title and its one action share a line at every width, the action
          pinned to the right margin. Sitting it flush against the title
          crowded the two together; the screen's edges are what the eye
          reads the row against. Per direct feedback. */}
      <PageHeader title="Servicios" headingRef={headingRef} />
      {/* No "Agregar Servicio" here: the header's one action covers it at
          every width, and a servicio is a gasto with "se repite" ticked.
          Two buttons a screen apart that open the same form read as two
          different things. Per direct feedback. The sheet below stays
          mounted, with no trigger, purely to edit a row it is handed. */}
      <AddPendienteSheet
        open={isAddPendienteSheetOpen}
        showTrigger={false}
        onOpenChange={setIsAddPendienteSheetOpen}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        editPendiente={editPendiente}
        onEditFinished={() => {
          setEditPendiente(null)
        }}
        // No trigger of its own to hand focus back to: it is opened from a
        // row, and that row may be gone by the time it closes (paying one
        // removes it). Without this, closing it dropped focus onto <body>.
        // The heading is tabIndex -1 for exactly this.
        onCloseFocus={() => {
          headingRef.current?.focus()
        }}
      />
      {/* The same toolbar Histórico has, in the same order: the two screens
          are one screen with different rows in it, so they are steered the
          same way. Per direct feedback. */}
      <PageToolbar
        // Steps aside while searching, same as Histórico: the search reaches
        // across months here too, so a pager that no longer decided what was
        // on screen would be a lie.
        //
        // Otherwise it is the one pager in the app with no forward limit --
        // a service's due date is in the future by definition, so next
        // month's list is the whole point of the screen.
        scope={
          isSearching ? null : (
            <MonthPager
              inline
              viewedMonth={viewedMonth}
              onViewedMonthChange={setViewedMonth}
              maxMonthsAhead={Infinity}
            />
          )
        }
        search={
          <SearchInput
            label="Buscar servicios"
            placeholder="Buscar servicios"
            value={query}
            onChange={setQuery}
          />
        }
        tabs={
          <FilterTabs
            label="Filtrar servicios"
            value={filter}
            tabs={PENDIENTES_FILTERS}
            onChange={setFilter}
          />
        }
        // Belongs next to the month it fills: bills do not carry over on
        // their own, a member picks which ones come into this month.
        action={
          isSearching ? null : (
            <CarryRecurrentesSheet
              db={db}
              householdId={membership.householdId}
              monthStart={monthStart}
            />
          )
        }
      />
      <PendientesList
        db={db}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
        query={query}
        filter={filter}
        monthStart={monthStart}
        monthEnd={monthEnd}
        householdId={membership.householdId}
        onAddPendiente={() => {
          setIsAddPendienteSheetOpen(true)
        }}
        onClearQuery={() => {
          setQuery('')
        }}
        onEditPendiente={(pendiente, categoryName) => {
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
            autoDebit: pendiente.autoDebit,
            currency: pendiente.currency,
            // Without it a paid row opened as an editable pending one, and
            // "Eliminar servicio" was refused and swallowed: the sheet
            // closed and the bill stayed. Paid, the only action offered is
            // "Deshacer pago" -- after which it can be deleted.
            isPaid: pendiente.status === 'paid',
          })
        }}
        onMarkPaid={(pendiente, categoryName) => {
          // "Pagar" opens the same edit sheet as tapping the row, just with
          // "Ya lo pagué" pre-checked -- one form for both editing and
          // paying, per direct feedback (this used to open a separate
          // amount-only sheet).
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
            autoDebit: pendiente.autoDebit,
            currency: pendiente.currency,
            defaultMarkPaid: true,
          })
        }}
      />
    </div>
  )
}

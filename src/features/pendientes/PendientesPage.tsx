import { useRef, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { PageHeader } from '@/components/PageHeader'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { EditPendienteTarget } from './AddPendienteForm'
import { MonthPager } from '@/features/expenses'
import { SearchInput } from '@/components/ui/search-input'
import { currentMonthRange } from '@/lib/expenses'
import { PendientesList } from './PendientesList'

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
      {/* Title and its one action on the same line at every width, both on
          the left -- the action belongs to the title, and pushed out to the
          far right edge it read as unrelated chrome. Per direct feedback. */}
      <div className="flex w-full items-center gap-3">
        <PageHeader
          title="Servicios"
          headingRef={headingRef}
          className="w-auto"
        />
        <AddPendienteSheet
          triggerClassName="shrink-0 px-5"
          open={isAddPendienteSheetOpen}
          onOpenChange={setIsAddPendienteSheetOpen}
          db={db}
          householdId={membership.householdId}
          memberId={currentUserId}
          authorDisplayName={authorDisplayName}
          editPendiente={editPendiente}
          onEditFinished={() => {
            setEditPendiente(null)
          }}
        />
      </div>
      {/* Above the pager, not below it: the pager steps aside while
          searching, and a box under it would jump up the screen when it
          did. Same order as Histórico. */}
      <SearchInput
        label="Buscar servicios"
        placeholder="Buscar por nombre o categoría"
        value={query}
        onChange={setQuery}
      />
      {/* Steps aside while searching, same as Histórico: the search reaches
          across months here too, so a pager that no longer decided what was
          on screen would be a lie.

          Otherwise it is the one pager in the app that goes forward -- a
          service's due date is in the future by definition, so next month's
          list is the whole point of the screen. */}
      {query.trim() === '' ? (
        <MonthPager
          viewedMonth={viewedMonth}
          onViewedMonthChange={setViewedMonth}
          allowFuture
        />
      ) : null}
      <PendientesList
        db={db}
        query={query}
        monthStart={monthStart}
        monthEnd={monthEnd}
        householdId={membership.householdId}
        onEditPendiente={(pendiente, categoryName) => {
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
            autoDebit: pendiente.autoDebit,
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
            defaultMarkPaid: true,
          })
        }}
      />
    </div>
  )
}

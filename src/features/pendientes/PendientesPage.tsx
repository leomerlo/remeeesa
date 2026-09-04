import { useRef, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { PageHeader } from '@/components/PageHeader'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { EditPendienteTarget } from './AddPendienteForm'
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

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Pendientes" headingRef={headingRef} />
      <AddPendienteSheet
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
      <PendientesList
        db={db}
        householdId={membership.householdId}
        onEditPendiente={(pendiente, categoryName) => {
          setEditPendiente({
            pendienteId: pendiente.id,
            name: pendiente.name,
            categoryName,
            dueDate: pendiente.dueDate,
            expectedAmount: pendiente.expectedAmount,
            recurring: pendiente.recurring,
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
            defaultMarkPaid: true,
          })
        }}
      />
    </div>
  )
}

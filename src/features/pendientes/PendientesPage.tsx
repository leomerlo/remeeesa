import { useEffect, useRef, useState } from 'react'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { PageHeader } from '@/components/PageHeader'
import { AddPendienteSheet } from './AddPendienteSheet'
import type { EditPendienteTarget } from './AddPendienteForm'
import { MarkPendientePaidSheet } from './MarkPendientePaidSheet'
import { PendientesList } from './PendientesList'

export type PendientesPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function PendientesPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: PendientesPageProps): ReactElement {
  const firebase = useFirebase()
  const { currentUserId, db, membership } = useHouseholdMembership({
    currentUserId: currentUserIdProp,
    householdsDb,
  })
  const [isAddPendienteSheetOpen, setIsAddPendienteSheetOpen] = useState(false)
  const [editPendiente, setEditPendiente] =
    useState<EditPendienteTarget | null>(null)
  const [markPendienteTarget, setMarkPendienteTarget] =
    useState<Pendiente | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const markPendienteTriggerRef = useRef<HTMLElement | null>(null)
  const wasMarkPendienteOpenRef = useRef(markPendienteTarget !== null)

  // Unlike AddPendienteSheet's own "Nuevo pendiente" trigger, the mark-paid
  // sheet's trigger is a per-row "Pagar" button owned by PendientesList
  // -- and neither Sheet is wrapped in a Radix Dialog.Trigger (both are
  // fully externally controlled), so there's no automatic close-focus
  // restoration to rely on; it has to be done by hand here, same as
  // AddPendienteSheet/AddExpenseSheet already do for their own trigger. The
  // extra wrinkle for this sheet: a successful mark-paid (or an
  // already-paid/not-found error, both of which invalidate the
  // pending-pendientes query) removes the triggering row entirely, so the
  // captured element may no longer be in the document by the time the sheet
  // closes -- fall back to the page heading in that case.
  useEffect(() => {
    if (wasMarkPendienteOpenRef.current && markPendienteTarget === null) {
      const trigger = markPendienteTriggerRef.current
      if (trigger !== null && trigger.isConnected) {
        trigger.focus()
      } else {
        headingRef.current?.focus()
      }
      markPendienteTriggerRef.current = null
    }
    wasMarkPendienteOpenRef.current = markPendienteTarget !== null
  }, [markPendienteTarget])

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

  const authorDisplayName = authorDisplayNameFromAuth(
    firebase.auth?.currentUser,
  )

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Pendientes" headingRef={headingRef} />
      <AddPendienteSheet
        open={isAddPendienteSheetOpen}
        onOpenChange={setIsAddPendienteSheetOpen}
        db={db}
        householdId={membership.householdId}
        editPendiente={editPendiente}
        onEditFinished={() => {
          setEditPendiente(null)
        }}
      />
      <MarkPendientePaidSheet
        pendiente={markPendienteTarget}
        onOpenChange={setMarkPendienteTarget}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
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
        onMarkPaid={(pendiente) => {
          markPendienteTriggerRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
          setMarkPendienteTarget(pendiente)
        }}
      />
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import type { Cuenta } from '@/lib/cuentas'
import { PageHeader } from '@/components/PageHeader'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { EditCuentaTarget } from './AddCuentaForm'
import { MarkCuentaPaidSheet } from './MarkCuentaPaidSheet'
import { PendingCuentasList } from './PendingCuentasList'

export type CuentasPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function CuentasPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: CuentasPageProps): ReactElement {
  const firebase = useFirebase()
  const { currentUserId, db, membership } = useHouseholdMembership({
    currentUserId: currentUserIdProp,
    householdsDb,
  })
  const [isAddCuentaSheetOpen, setIsAddCuentaSheetOpen] = useState(false)
  const [editCuenta, setEditCuenta] = useState<EditCuentaTarget | null>(null)
  const [markCuentaTarget, setMarkCuentaTarget] = useState<Cuenta | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const markCuentaTriggerRef = useRef<HTMLElement | null>(null)
  const wasMarkCuentaOpenRef = useRef(markCuentaTarget !== null)

  // Unlike AddCuentaSheet's own "Nueva cuenta" trigger, the mark-paid
  // sheet's trigger is a per-row "Pagar" button owned by PendingCuentasList
  // -- and neither Sheet is wrapped in a Radix Dialog.Trigger (both are
  // fully externally controlled), so there's no automatic close-focus
  // restoration to rely on; it has to be done by hand here, same as
  // AddCuentaSheet/AddExpenseSheet already do for their own trigger. The
  // extra wrinkle for this sheet: a successful mark-paid (or an
  // already-paid/not-found error, both of which invalidate the
  // pending-cuentas query) removes the triggering row entirely, so the
  // captured element may no longer be in the document by the time the sheet
  // closes -- fall back to the page heading in that case.
  useEffect(() => {
    if (wasMarkCuentaOpenRef.current && markCuentaTarget === null) {
      const trigger = markCuentaTriggerRef.current
      if (trigger !== null && trigger.isConnected) {
        trigger.focus()
      } else {
        headingRef.current?.focus()
      }
      markCuentaTriggerRef.current = null
    }
    wasMarkCuentaOpenRef.current = markCuentaTarget !== null
  }, [markCuentaTarget])

  if (currentUserId === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (currentUserId === null) {
    return <Navigate to="/" replace />
  }

  if (membership === undefined) {
    return (
      <p role="status" className="text-sm font-medium">
        Cargando…
      </p>
    )
  }

  if (membership === null) {
    return <Navigate to="/" replace />
  }

  const authorDisplayName = authorDisplayNameFromAuth(
    firebase.auth?.currentUser,
  )

  return (
    <div className="flex w-full flex-col gap-6">
      <PageHeader title="Cuentas" headingRef={headingRef} />
      <AddCuentaSheet
        open={isAddCuentaSheetOpen}
        onOpenChange={setIsAddCuentaSheetOpen}
        db={db}
        householdId={membership.householdId}
        editCuenta={editCuenta}
        onEditFinished={() => {
          setEditCuenta(null)
        }}
      />
      <MarkCuentaPaidSheet
        cuenta={markCuentaTarget}
        onOpenChange={setMarkCuentaTarget}
        db={db}
        householdId={membership.householdId}
        memberId={currentUserId}
        authorDisplayName={authorDisplayName}
      />
      <PendingCuentasList
        db={db}
        householdId={membership.householdId}
        onEditCuenta={(cuenta, categoryName) => {
          setEditCuenta({
            cuentaId: cuenta.id,
            name: cuenta.name,
            categoryName,
            dueDate: cuenta.dueDate,
            expectedAmount: cuenta.expectedAmount,
            recurring: cuenta.recurring,
          })
        }}
        onMarkPaid={(cuenta) => {
          markCuentaTriggerRef.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
          setMarkCuentaTarget(cuenta)
        }}
      />
    </div>
  )
}

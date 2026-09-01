import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useFirebase } from '@/lib/firebaseContext'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import type { Cuenta } from '@/lib/cuentas'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { EditCuentaTarget } from './AddCuentaForm'
import { MarkCuentaPaidSheet } from './MarkCuentaPaidSheet'
import { PendingCuentasList } from './PendingCuentasList'

export type CuentasPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

// Duplicated from HomePage.tsx -- this project tolerates this kind of small
// helper duplication rather than factoring out a shared module for it (see
// e.g. localDateInputValue's duplication across the expense/cuenta forms).
function authorDisplayNameFromAuth(
  user:
    | {
        readonly displayName?: string | null
        readonly email?: string | null
      }
    | null
    | undefined,
): string {
  const displayName = user?.displayName?.trim()
  if (displayName !== undefined && displayName !== '') {
    return displayName
  }
  const email = user?.email?.trim()
  if (email !== undefined && email !== '') {
    const localPart = email.split('@')[0]?.trim()
    if (localPart !== undefined && localPart !== '') {
      return localPart
    }
  }
  return 'Miembro'
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
  const [markCuentaTarget, setMarkCuentaTarget] = useState<Cuenta | null>(
    null,
  )
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

  const authorDisplayName = authorDisplayNameFromAuth(firebase.auth?.currentUser)

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-title outline-none">
        Cuentas
      </h1>
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

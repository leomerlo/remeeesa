import { useState } from 'react'
import type { ReactElement } from 'react'
import { Navigate } from 'react-router-dom'
import { useHouseholdMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { AddCuentaSheet } from './AddCuentaSheet'
import type { EditCuentaTarget } from './AddCuentaForm'
import { PendingCuentasList } from './PendingCuentasList'

export type CuentasPageProps = {
  readonly currentUserId?: string | null
  readonly householdsDb?: HouseholdsDb
}

export function CuentasPage({
  currentUserId: currentUserIdProp,
  householdsDb,
}: CuentasPageProps): ReactElement {
  const { currentUserId, db, membership } = useHouseholdMembership({
    currentUserId: currentUserIdProp,
    householdsDb,
  })
  const [isAddCuentaSheetOpen, setIsAddCuentaSheetOpen] = useState(false)
  const [editCuenta, setEditCuenta] = useState<EditCuentaTarget | null>(null)

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

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <h1 className="text-title">Cuentas</h1>
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
      />
    </div>
  )
}

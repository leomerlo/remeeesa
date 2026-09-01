import { useState } from 'react'
import type { ReactElement } from 'react'
import { Sheet } from '@/components/ui/sheet'
import type { Cuenta } from '@/lib/cuentas'
import type { HouseholdsDb } from '@/lib/households'
import { MarkCuentaPaidForm } from './MarkCuentaPaidForm'

export type MarkCuentaPaidSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly cuenta: Cuenta | null
  readonly onOpenChange: (cuenta: Cuenta | null) => void
}

export function MarkCuentaPaidSheet({
  db,
  householdId,
  memberId,
  authorDisplayName,
  cuenta,
  onOpenChange,
}: MarkCuentaPaidSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const open = cuenta !== null

  function handleOpenChange(next: boolean): void {
    // A submit already in flight must resolve inside the still-mounted
    // form: dismissing (Escape, overlay, close control) while pending would
    // unmount MarkCuentaPaidForm before its mutation settles, silently
    // discarding the outcome -- including a failure the user would
    // otherwise see as an alert. Mirrors AddCuentaSheet's guard.
    if (!next && isSubmitting) {
      return
    }
    if (!next) {
      onOpenChange(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} title="Marcar pagada">
      {cuenta !== null ? (
        <MarkCuentaPaidForm
          key={cuenta.id}
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          cuenta={cuenta}
          onDone={() => {
            onOpenChange(null)
          }}
          onPendingChange={setIsSubmitting}
        />
      ) : null}
    </Sheet>
  )
}

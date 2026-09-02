import { useState } from 'react'
import type { ReactElement } from 'react'
import { Sheet } from '@/components/ui/sheet'
import type { Pendiente } from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { MarkPendientePaidForm } from './MarkPendientePaidForm'

export type MarkPendientePaidSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly pendiente: Pendiente | null
  readonly onOpenChange: (pendiente: Pendiente | null) => void
}

export function MarkPendientePaidSheet({
  db,
  householdId,
  memberId,
  authorDisplayName,
  pendiente,
  onOpenChange,
}: MarkPendientePaidSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const open = pendiente !== null

  function handleOpenChange(next: boolean): void {
    // A submit already in flight must resolve inside the still-mounted
    // form: dismissing (Escape, overlay, close control) while pending would
    // unmount MarkPendientePaidForm before its mutation settles, silently
    // discarding the outcome -- including a failure the user would
    // otherwise see as an alert. Mirrors AddPendienteSheet's guard.
    if (!next && isSubmitting) {
      return
    }
    if (!next) {
      onOpenChange(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} title="Marcar pagado">
      {pendiente !== null ? (
        <MarkPendientePaidForm
          key={pendiente.id}
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          pendiente={pendiente}
          onDone={() => {
            onOpenChange(null)
          }}
          onPendingChange={setIsSubmitting}
        />
      ) : null}
    </Sheet>
  )
}

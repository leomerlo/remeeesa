import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddPendienteForm } from './AddPendienteForm'
import type { EditPendienteTarget } from './AddPendienteForm'

export type AddPendienteSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly db: HouseholdsDb
  readonly householdId: string
  // Only used to mark a Pendiente paid (the resulting Expense is attributed
  // to this member) -- see AddPendienteForm.
  readonly memberId: string
  readonly authorDisplayName: string
  readonly editPendiente?: EditPendienteTarget | null
  readonly onEditFinished?: () => void
  // /pendientes gives the trigger the full width on its own.
  readonly triggerClassName?: string
  // Home reuses this sheet purely to *edit/mark-paid* a row it was handed
  // (via editPendiente) -- adding goes through the unified AddGastoSheet
  // there instead. Without this the trigger rendered there anyway, per
  // AddExpenseSheet's own showTrigger precedent.
  readonly showTrigger?: boolean
}

export function AddPendienteSheet({
  open,
  onOpenChange,
  db,
  householdId,
  memberId,
  authorDisplayName,
  editPendiente = null,
  onEditFinished,
  triggerClassName = 'w-full',
  showTrigger = true,
}: AddPendienteSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isEditing = editPendiente !== null
  // Editing shares the exact same sheet as adding -- tapping a row (which
  // sets editPendiente, not `open`) opens it too, matching AddExpenseSheet's
  // convention.
  const sheetOpen = open || isEditing
  const wasOpenRef = useRef(sheetOpen)

  // Radix restores focus to its own Dialog.Trigger on close, but the trigger
  // here unmounts entirely while the sheet is open (see below), so there's
  // no trigger ref for Radix to hand focus back to -- restore it manually
  // once the trigger has remounted.
  useEffect(() => {
    if (wasOpenRef.current && !sheetOpen) {
      triggerRef.current?.focus()
    }
    wasOpenRef.current = sheetOpen
  }, [sheetOpen])

  function handleOpenChange(next: boolean): void {
    // A submit already in flight must resolve inside the still-mounted
    // form: dismissing (Escape, overlay, close control) while pending
    // would unmount AddPendienteForm before its mutation settles, silently
    // discarding the outcome -- including a failure the user would
    // otherwise see as an alert. Opening is never blocked.
    if (!next && isSubmitting) {
      return
    }
    if (isEditing) {
      if (!next) {
        onEditFinished?.()
      }
      return
    }
    onOpenChange(next)
  }

  return (
    <>
      {showTrigger && !sheetOpen ? (
        <Button
          ref={triggerRef}
          className={`gap-1.5 ${triggerClassName}`}
          onClick={() => {
            onOpenChange(true)
          }}
        >
          <Plus aria-hidden="true" />
          Nuevo recurrente
        </Button>
      ) : null}
      <Sheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        title={isEditing ? 'Editar pendiente' : 'Nuevo recurrente'}
      >
        <AddPendienteForm
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          editPendiente={editPendiente}
          onEditFinished={onEditFinished}
          onAdded={() => {
            onOpenChange(false)
          }}
          onPendingChange={setIsSubmitting}
        />
      </Sheet>
    </>
  )
}

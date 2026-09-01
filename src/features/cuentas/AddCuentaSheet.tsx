import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddCuentaForm } from './AddCuentaForm'
import type { EditCuentaTarget } from './AddCuentaForm'

export type AddCuentaSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly editCuenta?: EditCuentaTarget | null
  readonly onEditFinished?: () => void
}

export function AddCuentaSheet({
  open,
  onOpenChange,
  db,
  householdId,
  editCuenta = null,
  onEditFinished,
}: AddCuentaSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isEditing = editCuenta !== null
  // Editing shares the exact same sheet as adding -- tapping a row (which
  // sets editCuenta, not `open`) opens it too, matching AddExpenseSheet's
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
    // would unmount AddCuentaForm before its mutation settles, silently
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
      {!sheetOpen ? (
        <Button
          ref={triggerRef}
          onClick={() => {
            onOpenChange(true)
          }}
        >
          Nueva cuenta
        </Button>
      ) : null}
      <Sheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        title={isEditing ? 'Editar cuenta' : 'Nueva cuenta'}
      >
        <AddCuentaForm
          db={db}
          householdId={householdId}
          editCuenta={editCuenta}
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

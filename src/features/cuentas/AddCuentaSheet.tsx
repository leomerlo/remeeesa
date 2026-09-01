import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddCuentaForm } from './AddCuentaForm'

export type AddCuentaSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function AddCuentaSheet({
  open,
  onOpenChange,
  db,
  householdId,
}: AddCuentaSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(open)

  // Radix restores focus to its own Dialog.Trigger on close, but the trigger
  // here unmounts entirely while the sheet is open (see below), so there's
  // no trigger ref for Radix to hand focus back to -- restore it manually
  // once the trigger has remounted.
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      triggerRef.current?.focus()
    }
    wasOpenRef.current = open
  }, [open])

  function handleOpenChange(next: boolean): void {
    // A submit already in flight must resolve inside the still-mounted
    // form: dismissing (Escape, overlay, close control) while pending
    // would unmount AddCuentaForm before its mutation settles, silently
    // discarding the outcome -- including a failure the user would
    // otherwise see as an alert. Opening is never blocked.
    if (!next && isSubmitting) {
      return
    }
    onOpenChange(next)
  }

  return (
    <>
      {!open ? (
        <Button
          ref={triggerRef}
          onClick={() => {
            onOpenChange(true)
          }}
        >
          Nueva cuenta
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={handleOpenChange} title="Nueva cuenta">
        <AddCuentaForm
          db={db}
          householdId={householdId}
          onAdded={() => {
            onOpenChange(false)
          }}
          onPendingChange={setIsSubmitting}
        />
      </Sheet>
    </>
  )
}

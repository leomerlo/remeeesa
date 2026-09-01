import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddExpenseForm } from './AddExpenseForm'
import type { EditExpenseTarget } from './AddExpenseForm'

export type AddExpenseSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  readonly editExpense?: EditExpenseTarget | null
  readonly onEditFinished?: () => void
}

export function AddExpenseSheet({
  open,
  onOpenChange,
  db,
  householdId,
  memberId,
  authorDisplayName,
  editExpense = null,
  onEditFinished,
}: AddExpenseSheetProps): ReactElement {
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

  const isEditing = editExpense !== null
  // Add-mode and edit-mode can never coexist: the Sheet's overlay blocks the
  // underlying ExpenseList's Edit buttons while add-mode is open, so
  // `editExpense !== null` is sufficient as edit-mode's own open signal, ORed
  // with the existing `open` prop for add-mode.
  const sheetOpen = open || isEditing

  function handleOpenChange(next: boolean): void {
    // A submit already in flight must resolve inside the still-mounted
    // form: dismissing (Escape, overlay, close control) while pending
    // would unmount AddExpenseForm before its mutation settles, silently
    // discarding the outcome -- including a failure the user would
    // otherwise see as an alert. Opening is never blocked.
    if (!next && isSubmitting) {
      return
    }
    if (!next && isEditing) {
      // Edit dismiss = discard, and it's routed through onEditFinished
      // rather than onOpenChange (add-mode's callback).
      onEditFinished?.()
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
          Add expense
        </Button>
      ) : null}
      <Sheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        title={isEditing ? 'Edit expense' : 'Add expense'}
      >
        {isEditing ? (
          <AddExpenseForm
            db={db}
            householdId={householdId}
            memberId={memberId}
            authorDisplayName={authorDisplayName}
            editExpense={editExpense}
            onEditFinished={onEditFinished}
            onPendingChange={setIsSubmitting}
          />
        ) : (
          <AddExpenseForm
            db={db}
            householdId={householdId}
            memberId={memberId}
            authorDisplayName={authorDisplayName}
            onAdded={() => {
              onOpenChange(false)
            }}
            onPendingChange={setIsSubmitting}
          />
        )}
      </Sheet>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'
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
  const isEditing = editExpense !== null
  // Editing now shares the exact same sheet as adding -- tapping a row
  // (which sets editExpense, not `open`) opens it too, instead of the old
  // behavior where editing bypassed the sheet and rendered the form
  // awkwardly inline on the page.
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
    // would unmount AddExpenseForm before its mutation settles, silently
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
          className="flex-1 gap-1.5"
          onClick={() => {
            onOpenChange(true)
          }}
        >
          <Plus aria-hidden="true" />
          Agregar gasto
        </Button>
      ) : null}
      <Sheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        title={isEditing ? 'Editar gasto' : 'Agregar gasto'}
      >
        <AddExpenseForm
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          editExpense={editExpense}
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

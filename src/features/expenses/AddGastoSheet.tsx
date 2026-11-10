import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddGastoForm } from './AddGastoForm'
import type { EditPurchaseTarget } from './AddGastoForm'

export type AddGastoSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  // Home puts this button under the budget cards, right-aligned; Histórico
  // shares a row with the page title. Same button, different place.
  readonly triggerClassName?: string
  // False for a sheet mounted only to edit a row it is handed -- the screen
  // has no button of its own, the one in the header is the way in.
  readonly showTrigger?: boolean
  // Drops the label to a screen-reader-only one, for the round button in
  // the phone's nav bar where there is room for the plus and nothing else.
  readonly triggerIconOnly?: boolean
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
  // Forwarded to AddGastoForm -- see there for why Histórico shows fewer
  // toggles than Home.
  readonly showRecurringOptions?: boolean
  // Forwarded to AddGastoForm.
  readonly defaultDueDate?: Date
  // Set by tapping a card purchase in the movements list: opens the sheet
  // to edit it, like AddExpenseSheet's editExpense.
  readonly editPurchase?: EditPurchaseTarget | null
  readonly onEditFinished?: () => void
}

// Home's single "add" entry point -- replaces the old side-by-side
// "Agregar gasto" / "Agregar Servicio" triggers. See AddGastoForm for why
// one form covers both.
export function AddGastoSheet({
  open,
  onOpenChange,
  triggerClassName = 'w-full lg:w-auto lg:self-end',
  showTrigger = true,
  triggerIconOnly = false,
  db,
  householdId,
  memberId,
  authorDisplayName,
  showRecurringOptions = true,
  defaultDueDate,
  editPurchase = null,
  onEditFinished,
}: AddGastoSheetProps): ReactElement {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isEditing = editPurchase !== null
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
    // would unmount AddGastoForm before its mutation settles, silently
    // discarding the outcome. Opening is never blocked.
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
          <Plus
            aria-hidden="true"
            className={triggerIconOnly ? 'size-6' : ''}
          />
          <span className={triggerIconOnly ? 'sr-only' : ''}>
            Agregar gasto
          </span>
        </Button>
      ) : null}
      <Sheet
        open={sheetOpen}
        onOpenChange={handleOpenChange}
        title={isEditing ? 'Editar compra' : 'Agregar gasto'}
      >
        <AddGastoForm
          // A fresh form per purchase, so its fields start from that one.
          key={editPurchase?.purchase.id ?? 'new'}
          editPurchase={editPurchase}
          {...(onEditFinished === undefined ? {} : { onEditFinished })}
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          showRecurringOptions={showRecurringOptions}
          {...(defaultDueDate === undefined ? {} : { defaultDueDate })}
          onAdded={() => {
            onOpenChange(false)
          }}
          onPendingChange={setIsSubmitting}
        />
      </Sheet>
    </>
  )
}

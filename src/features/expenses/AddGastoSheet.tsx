import { useEffect, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import type { HouseholdsDb } from '@/lib/households'
import { AddGastoForm } from './AddGastoForm'

export type AddGastoSheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  // Home puts this button under the budget cards, right-aligned; Histórico
  // shares a row with the page title. Same button, different place.
  readonly triggerClassName?: string
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly memberId: string
  readonly authorDisplayName: string
}

// Home's single "add" entry point -- replaces the old side-by-side
// "Agregar gasto" / "Agregar Servicio" triggers. See AddGastoForm for why
// one form covers both.
export function AddGastoSheet({
  open,
  onOpenChange,
  triggerClassName = 'w-full lg:w-auto lg:self-end lg:px-6',
  db,
  householdId,
  memberId,
  authorDisplayName,
}: AddGastoSheetProps): ReactElement {
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
    // would unmount AddGastoForm before its mutation settles, silently
    // discarding the outcome. Opening is never blocked.
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
          className={`gap-1.5 ${triggerClassName}`}
          onClick={() => {
            onOpenChange(true)
          }}
        >
          <Plus aria-hidden="true" />
          Agregar gasto
        </Button>
      ) : null}
      <Sheet open={open} onOpenChange={handleOpenChange} title="Agregar gasto">
        <AddGastoForm
          db={db}
          householdId={householdId}
          memberId={memberId}
          authorDisplayName={authorDisplayName}
          onAdded={() => {
            onOpenChange(false)
          }}
          onPendingChange={setIsSubmitting}
        />
      </Sheet>
    </>
  )
}

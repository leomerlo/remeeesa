import { useState } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Button } from './button'
import { Sheet } from './sheet'

export type ConfirmDestructiveProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  // What exactly is about to be lost, in the household's own words.
  readonly description: ReactNode
  readonly confirmLabel: string
  readonly pending?: boolean
  readonly onConfirm: () => void
}

// The one "are you sure" in the app. Destroying something gets a stop of its
// own rather than a second tap on the same button in the same place: the
// thing being destroyed is named, the fact that it cannot be undone is said
// out loud, and the confirm is the red button while cancel is the quiet one
// -- so the dangerous choice is the one you have to aim at. Per direct
// feedback.
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending = false,
  onConfirm,
}: ConfirmDestructiveProps): ReactElement {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-title font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
          <p className="text-error text-sm font-semibold">
            Esto no se puede deshacer.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Borrando…' : confirmLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

// Convenience for the common shape: a trigger that opens the confirmation
// and closes it once the action resolves.
export function useConfirmDestructive(): {
  readonly open: boolean
  readonly ask: () => void
  readonly close: () => void
  readonly onOpenChange: (next: boolean) => void
} {
  const [open, setOpen] = useState(false)
  return {
    open,
    ask: () => {
      setOpen(true)
    },
    close: () => {
      setOpen(false)
    },
    onOpenChange: setOpen,
  }
}

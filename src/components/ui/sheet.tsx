import type { ReactNode } from 'react'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { X } from 'lucide-react'

export type SheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly children: ReactNode
}

function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-slot="sheet-overlay"
          className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          data-slot="sheet-content"
          className="bg-card shadow-raised fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] w-full flex-col rounded-t-3xl p-6 pt-8 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom"
        >
          <VisuallyHidden.Root asChild>
            <Dialog.Title>{title}</Dialog.Title>
          </VisuallyHidden.Root>
          <Dialog.Close
            data-slot="sheet-close"
            className="hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-3"
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Cerrar</span>
          </Dialog.Close>
          {/* Only this body scrolls -- the close button above stays pinned
              in the non-scrolling part of Dialog.Content so it never
              scrolls out of reach on tall content. */}
          <div data-slot="sheet-body" className="min-h-0 overflow-y-auto">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Sheet }

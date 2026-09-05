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
          // A sheet rising from the bottom edge is a phone gesture -- the
          // thumb is down there. On a pointer-driven window the same dialog
          // becomes a centred modal: it stops travelling the full height of
          // a tall screen, and it lands where the cursor already is. Below
          // `lg` nothing changes.
          className="bg-card shadow-raised fixed inset-x-0 bottom-0 z-50 flex max-h-[96vh] w-full flex-col rounded-t-3xl p-6 pt-8 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom lg:inset-x-auto lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-h-[85vh] lg:w-full lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:data-[state=closed]:slide-out-to-bottom-2 lg:data-[state=open]:slide-in-from-bottom-2"
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
          {/* This fills the remaining height inside Dialog.Content's
              max-h-[96vh] cap; the close button above stays pinned in the
              non-scrolling part of Dialog.Content so it never scrolls out
              of reach. Content passed in as `children` (each Sheet-hosted
              form) owns its own internal scroll region (with
              overscroll-contain, so scrolling past its edge never chains
              into a background scroll/bounce) + pinned action footer --
              see e.g. AddExpenseForm -- rather than this div scrolling the
              whole thing as one block, which used to let a tall form's
              submit button scroll out of view. */}
          <div data-slot="sheet-body" className="flex min-h-0 flex-col">
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export { Sheet }

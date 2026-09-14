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
          // A centred modal at every width, not a bottom sheet on phones.
          // It used to rise from the bottom edge below `lg` (thumb reach),
          // but the forms it hosts are tall enough to fill the screen from
          // there, which read as a second page rather than a dialog over
          // the one you were on. Per direct feedback. Inset by 1rem a side
          // so the card never touches the screen edge.
          className="bg-card shadow-raised fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl p-6 pt-8 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-2"
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

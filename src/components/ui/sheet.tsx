import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// A modal Dialog locks scrolling everywhere except its own content element
// (react-remove-scroll's one "shard"). A popup portalled to document.body --
// a combobox listbox, say -- is outside that shard, so touch-dragging it is
// cancelled and the list cannot be scrolled at all on a phone. Anything
// rendering a portalled popup from inside a Sheet reads this and portals
// into the Sheet's own content element instead, which is the shard.
const SheetContainerContext = createContext<HTMLElement | null>(null)

export function useSheetContainer(): HTMLElement | null {
  return useContext(SheetContainerContext)
}

export type SheetProps = {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly children: ReactNode
  // 'panel' (the default) is a form: the whole screen on a phone, a
  // centred card from `lg`. 'prompt' is a question -- a destructive
  // confirmation -- and stays a small centred card at every width, because
  // taking over the screen to ask "¿seguro?" is louder than the question.
  readonly variant?: 'panel' | 'prompt'
}

function Sheet({
  open,
  onOpenChange,
  title,
  children,
  variant = 'panel',
}: SheetProps) {
  // State, not a ref: consumers portal into this element, so they have to
  // re-render once it exists.
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Blurred, not only dimmed: a flat scrim over a busy page still
            lets every card and figure behind it read, and the modal ends up
            competing with the screen it is supposed to sit above. Blurring
            pushes the page back so the card in front is the only thing in
            focus. An explicit 6px rather than a named step, so the amount
            does not move if Tailwind's blur scale is renumbered. Per direct
            feedback. */}
        <Dialog.Overlay
          data-slot="sheet-overlay"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[6px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
        />
        <Dialog.Content
          ref={setContentElement}
          data-slot="sheet-content"
          // A form takes the whole phone screen and becomes a centred card
          // from `lg`. It used to be a centred card at every width, capped
          // at 85vh: on a phone that left a form squeezed into a box with
          // margins on all four sides, and with the keyboard up there was
          // barely a field visible. Full bleed gives the fields the screen
          // and puts the form's own pinned footer exactly where a thumb
          // expects the action to be. Per direct feedback.
          //
          // The safe-area padding is the notch and the home indicator: at a
          // flat 1.5rem the close button sat under the status bar and the
          // submit button under the gesture bar.
          className={cn(
            'bg-card border-border-card fixed z-50 flex flex-col p-6 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
            // Each variant carries its own positioning end to end rather
            // than sharing an `lg:` block: `lg:inset-auto` and `lg:top-1/2`
            // are the same property to tailwind-merge, so whichever came
            // last silently won and the card lost its centring.
            //
            // From `lg` both land in the same place: a centred card inset
            // by 1rem a side so it never touches the screen edge.
            variant === 'panel'
              ? 'inset-0 h-full w-full rounded-none border-0 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4 lg:inset-auto lg:top-1/2 lg:left-1/2 lg:h-auto lg:max-h-[85vh] lg:w-[calc(100%-2rem)] lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-3xl lg:border lg:pt-8 lg:pb-6 lg:data-[state=open]:slide-in-from-bottom-2 lg:data-[state=closed]:slide-out-to-bottom-2'
              : 'top-1/2 left-1/2 max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-3xl border pt-8 data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:slide-out-to-bottom-2',
          )}
        >
          {/* A real header row, not a floating X over the content: the
              title and the way out belong to the same band, and a line
              under it is what makes the body below read as the part that
              scrolls. Per direct feedback. */}
          <div
            data-slot="sheet-header"
            className="border-border-subtle flex shrink-0 items-center justify-between gap-3 border-b pb-4"
          >
            <Dialog.Title className="text-title truncate font-semibold">
              {title}
            </Dialog.Title>
            <Dialog.Close
              data-slot="sheet-close"
              className="hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex size-[46px] shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3"
            >
              <X className="size-6" aria-hidden="true" />
              <span className="sr-only">Cerrar</span>
            </Dialog.Close>
          </div>
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
          {/* flex-1 so a full-screen panel's body takes the height left
              over by the close button's row, which is what puts each
              form's own footer at the bottom of the screen rather than
              directly under its last field. */}
          <div
            data-slot="sheet-body"
            className="flex min-h-0 flex-1 flex-col pt-4"
          >
            <SheetContainerContext.Provider value={contentElement}>
              {children}
            </SheetContainerContext.Provider>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

// A Sheet-hosted form is two bands, and these are them. The fields scroll;
// the actions do not. A single scrolling block let a tall form's submit
// button scroll out of view, which on a phone meant the one thing you
// opened the sheet to press was the one thing you could not reach. Per
// direct feedback: header and footer fixed, content scrolling, in every
// modal that has both.
//
// The destructive confirmations are deliberately left out: those are a
// question and its two answers, short by definition, with nothing to
// scroll and no band to pin. Per direct feedback.
function SheetScrollArea({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <div
      data-slot="sheet-scroll-area"
      // overscroll-contain so dragging past the end never chains into the
      // page behind; overflow-x-hidden so a wide child cannot make the
      // whole sheet scroll sideways.
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain',
        className,
      )}
    >
      {children}
    </div>
  )
}

function SheetFooter({
  className,
  children,
}: {
  readonly className?: string
  readonly children: ReactNode
}) {
  return (
    <div
      data-slot="sheet-footer"
      // The line is what makes it read as a footer rather than as the last
      // thing in the list above it.
      className={cn('border-border-subtle shrink-0 border-t pt-4', className)}
    >
      {children}
    </div>
  )
}

export { Sheet, SheetFooter, SheetScrollArea }

import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

// Thin wrapper, same trim convention as label.tsx/popover.tsx. Sized to read
// at the same visual scale as button.tsx's controls (h-11) rather than the
// much bulkier h-11/w-20 track this used to be, which looked oversized next
// to everything else on a form. `data-[state=checked]` reuses the
// `bg-primary` token button.tsx's `default` variant uses for its active
// state, so "on" reads consistently across controls. Focus ring matches
// sheet.tsx's close-button convention.
//
// Off is the outline treatment (2px neutral border, grey thumb) the `outline`
// button variant uses, not a filled grey track: filled, an off switch was
// indistinguishable from the disabled one right next to it. Disabled stays
// the same dimmed pass over whichever of the two states it is in.
function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-border bg-transparent p-0.5 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-transparent data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full transition-transform data-[state=checked]:translate-x-5 data-[state=checked]:bg-background data-[state=checked]:shadow-sm data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-muted-foreground"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

import type { ComponentProps } from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

// Thin wrapper, same trim convention as label.tsx/popover.tsx. The track is
// sized to this project's 44px touch-target convention (see button.tsx's
// `h-11`/`size-11` size scale) rather than a typical smaller toggle, so the
// whole track -- not just a padded hit area around it -- is tappable.
// `data-[state=checked]` reuses the `bg-primary` token button.tsx's `default`
// variant uses for its active state, so "on" reads consistently across
// controls. Focus ring matches sheet.tsx's close-button convention.
function Switch({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-11 w-20 shrink-0 items-center rounded-full border border-transparent bg-muted p-1 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-9 rounded-full bg-background shadow-sm transition-transform data-[state=checked]:translate-x-9 data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }

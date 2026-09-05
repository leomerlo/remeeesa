import type { ComponentProps } from 'react'
import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      // One label style for the whole app: semibold, in the ordinary text
      // colour. Per direct feedback -- call sites had drifted into muted
      // grey at medium weight in some forms and plain medium in others, so
      // the same field read differently depending on which sheet it was in.
      // Every override of colour/weight was removed rather than left to
      // fight this.
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-semibold text-foreground select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }

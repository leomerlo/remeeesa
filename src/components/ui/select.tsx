import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

// The app's select, matching input.tsx field for field: same height, radius,
// border and focus ring. Six of these had been hand-rolled across five forms
// with four different class strings between them.
//
// The chevron is ours, not the browser's. A native select draws its own, and
// where it lands is the user agent's business: padding-right does not move
// it reliably, so on a narrow field it ended up against the border while a
// wide one looked fine -- the same control, two different results, which is
// exactly what was reported. appearance-none drops it, and the icon below
// sits at a fixed inset from the edge whatever the field's width. It uses
// currentColor, so it follows the theme rather than being a painted-on
// image.
//
// `className` lands on the wrapper, because what a caller needs to control
// is the field's footprint (`w-auto shrink-0` for the currency pickers).
// Font size still reaches the select: it inherits.
function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className={cn('relative inline-flex w-full items-center', className)}>
      <select
        data-slot="select"
        className="border-input h-12 w-full min-w-0 appearance-none rounded-lg border bg-transparent py-1 pr-10 pl-4 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute right-3 size-4"
      />
    </div>
  )
}

export { Select }

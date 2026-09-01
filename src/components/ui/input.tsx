import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// Unlike Button (a control the reference shows as a pill), the reference
// shows form fields as rounded rectangles -- rounded-lg is Tailwind's stock
// 8px default, untouched by this project's --radius-2xl/--radius-3xl
// overrides in index.css, so no new token was needed. h-12 (48px) instead
// of the 44px floor -- still clears the touch-target minimum, but reads
// closer to the reference's generously tall mobile fields.
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-12 w-full min-w-0 rounded-lg border border-input bg-transparent px-4 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

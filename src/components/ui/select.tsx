import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

// The app's native select, matching input.tsx field for field: same height,
// same radius, same border and focus ring. Six of these had been hand-rolled
// with four different class strings between them, so a dropdown looked like
// a slightly different control depending on which form it was in.
//
// The right padding is the part that cannot be shared with Input: a native
// select draws its own arrow inside that padding, and at the 8px most of
// these were using the chevron sat against the border. pr-9 leaves it room
// to stand clear of the edge. Per direct feedback.
function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'border-input h-12 w-full min-w-0 rounded-lg border bg-transparent py-1 pr-9 pl-4 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Select }

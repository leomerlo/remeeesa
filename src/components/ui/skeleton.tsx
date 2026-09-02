import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// A pulsing placeholder block, shaped per call site to mirror the content
// it stands in for (a card, a row, a circle) so nothing visibly jumps or
// resizes once the real content replaces it. Decorative only -- every
// loading state pairs this with an sr-only "Cargando…" on the actual
// role="status" element, so a screen reader announces the wait without
// reading out a wall of empty rounded rectangles.
function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-muted animate-pulse rounded-lg', className)}
      {...props}
    />
  )
}

export { Skeleton }

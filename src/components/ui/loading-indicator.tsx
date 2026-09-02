import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoadingIndicatorProps = {
  readonly label?: string
  readonly className?: string
}

// The one "waiting on something with no known shape yet" treatment --
// session/membership gates before the app even knows what screen it's
// looking at, where there's no final layout to mirror with a Skeleton.
// Centered and with a spinning icon rather than a bare line of text sitting
// wherever the DOM happened to put it, which is what every one of these
// screens rendered before.
export function LoadingIndicator({
  label = 'Cargando…',
  className,
}: LoadingIndicatorProps) {
  return (
    <div
      role="status"
      className={cn(
        'text-muted-foreground flex w-full items-center justify-center gap-2 py-12 text-sm font-medium',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

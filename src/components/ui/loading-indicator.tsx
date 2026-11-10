import { Illustration } from '@/components/Illustration'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { cn } from '@/lib/utils'

export type LoadingIndicatorProps = {
  readonly label?: string
  readonly className?: string
  // A spinner on one line instead of the mascot, for a panel inside a page
  // that has already drawn itself. The full treatment belongs to the moment
  // the app has nothing on screen at all.
  readonly compact?: boolean
}

// The one "waiting on something with no known shape yet" treatment --
// session/membership gates before the app even knows what screen it's
// looking at, where there's no final layout to mirror with a Skeleton.
//
// It used to be a 16px spinner and the word "Cargando…", which is what every
// app's loading state looks like when nobody decided what it should look
// like. It is the first thing anyone opening the app sees, often for a
// second or more, so it gets the same composition the empty states do: the
// mascot on a soft disc, breathing rather than spinning. Per direct
// feedback.
export function LoadingIndicator({
  label = 'Cargando…',
  className,
  compact = false,
}: LoadingIndicatorProps) {
  if (compact) {
    return (
      <div
        role="status"
        className={cn(
          'text-muted-foreground flex w-full items-center justify-center gap-2 py-8 text-sm font-medium',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="border-muted border-t-primary size-4 animate-spin rounded-full border-2"
        />
        {label}
      </div>
    )
  }

  return (
    <div
      role="status"
      className={cn(
        'flex w-full flex-col items-center justify-center gap-4 py-14',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="bg-muted relative flex size-28 shrink-0 items-center justify-center rounded-full"
      >
        {/* Two animations doing different jobs: the mascot bobs, and a ring
            sweeps around the disc behind it so the card still reads as
            "working" rather than "idle" at a glance. Both are suppressed
            under prefers-reduced-motion, where the composition alone is the
            loading state -- see the keyframes in index.css. */}
        <span className="border-primary/15 border-t-primary absolute inset-0 animate-spin rounded-full border-[3px] motion-reduce:animate-none" />
        <Illustration
          src={ILLUSTRATIONS.counting}
          className="size-20 animate-bob motion-reduce:animate-none"
        />
      </span>
      <span className="text-muted-foreground text-sm font-medium">{label}</span>
    </div>
  )
}

import type { ReactElement, ReactNode } from 'react'
import { Illustration } from '@/components/Illustration'
import { cn } from '@/lib/utils'

export type EmptyStateProps = {
  // Imported .webp from src/assets/illustrations. Omitted for a state that
  // is transient rather than a screen with nothing in it yet -- a search
  // that found nothing is a moment, not a place, and a full mascot there
  // reads as noise.
  readonly illustration?: string
  readonly title: string
  readonly description?: string
  // A single call to action, when there is an obvious next move.
  readonly action?: ReactNode
  readonly className?: string
}

// The one empty state in the app. Every screen used to hand-roll its own --
// an illustration at h-32 w-40, one muted sentence under it, floating on the
// page with nothing around it -- so an empty Histórico and an empty
// Servicios were the same three lines with a different noun, and none of
// them looked designed.
//
// This gives that moment a card of its own: the mascot on a soft disc, a
// real heading rather than a caption, and a supporting line that says what
// belongs here rather than only that nothing does. Per direct feedback.
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps): ReactElement {
  return (
    <div
      className={cn(
        'bg-card flex w-full flex-col items-center gap-5 rounded-2xl px-6 py-10 text-center',
        className,
      )}
    >
      {illustration === undefined ? null : (
        // The disc is what turns a floating sticker into a composed
        // element: the artwork has no ground of its own, so on a white card
        // it sat in empty space.
        <span
          aria-hidden="true"
          className="bg-muted flex size-36 shrink-0 items-center justify-center rounded-full"
        >
          <Illustration src={illustration} className="size-24" />
        </span>
      )}
      <div className="flex max-w-sm flex-col gap-1.5">
        <p role="status" className="text-title font-semibold">
          {title}
        </p>
        {description === undefined ? null : (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </div>
  )
}

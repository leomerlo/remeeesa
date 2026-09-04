import type { ReactElement } from 'react'
import { categoryBadgeColors } from '@/lib/expenses/categoryBadge'
import { cn } from '@/lib/utils'

export type CategoryBadgeProps = {
  readonly name: string
  readonly color: string
  readonly className?: string
}

// A category name wherever it appears as metadata on a row or card. It used
// to be plain grey text, indistinguishable from the date beside it, so the
// one piece of that line you actually scan for looked exactly like the part
// you don't. Per direct feedback it is a badge in the category's own colour
// -- pale chip, text dark enough to read on it (see categoryBadge), and
// barely rounded rather than a pill, which is the shape this app already
// gives to things you press.
export function CategoryBadge({
  name,
  color,
  className,
}: CategoryBadgeProps): ReactElement {
  const { background, foreground } = categoryBadgeColors(color)
  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: background, color: foreground }}
    >
      {name}
    </span>
  )
}

import type { ReactElement } from 'react'
import { cssVars } from '@/lib/cssVars'
import { categoryBadgeColors } from '@/lib/expenses/categoryBadge'
import { cn } from '@/lib/utils'

export type TintedBadgeProps = {
  readonly label: string
  // Any colour: the chip is a pale wash of it and the text a darkened
  // version, worked out so the pair clears AA whatever comes in. See
  // lib/expenses/categoryBadge.
  readonly color: string
  readonly className?: string
}

// The one badge shape in the app: a pale chip in some colour, text dark
// enough to read on it, and barely rounded rather than a pill -- a pill is
// the shape this app gives to things you press.
export function TintedBadge({
  label,
  color,
  className,
}: TintedBadgeProps): ReactElement {
  const { background, foreground } = categoryBadgeColors(color)
  return (
    <span
      className={cn(
        'inline-block max-w-full truncate rounded bg-[var(--badge-bg)] px-1.5 py-0.5 text-xs font-medium text-[var(--badge-fg)]',
        className,
      )}
      style={cssVars({ '--badge-bg': background, '--badge-fg': foreground })}
    >
      {label}
    </span>
  )
}

export type CategoryBadgeProps = {
  readonly name: string
  readonly color: string
  readonly className?: string
}

// A category name wherever it appears as metadata on a row or card. It used
// to be plain grey text, indistinguishable from the date beside it, so the
// one piece of that line you actually scan for looked exactly like the part
// you don't. Per direct feedback it is a badge in the category's own colour.
export function CategoryBadge({
  name,
  color,
  className,
}: CategoryBadgeProps): ReactElement {
  return <TintedBadge label={name} color={color} className={className} />
}

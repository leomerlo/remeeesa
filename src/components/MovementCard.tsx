import type { ReactElement, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { cssVars } from '@/lib/cssVars'
import { cn } from '@/lib/utils'

export type MovementCardProps = {
  readonly categoryName: string
  readonly categoryColor: string
  // Resolved by the caller rather than looked up in here: it is one of a
  // fixed set of module-level components, but deriving it inside a component
  // body reads as creating a component during render (and trips the
  // static-components lint rule).
  readonly CategoryIcon: LucideIcon
  readonly title: string
  // Already phrased: "Vence el 06/09/2026", "Pagado el 04/09/2026". See
  // lib/format's dueDateLabel / paidDateLabel.
  readonly when: string
  // True when `when` says a bill has been missed, so it can be said in the
  // colour the rest of the app uses for that.
  readonly isOverdue?: boolean
  readonly amount: ReactNode
  // Sits beside the category badge: "Servicio" in Histórico, nothing in
  // Servicios (where every row is one).
  readonly badge?: ReactNode
  // Trails the date: who logged it, in Histórico.
  readonly meta?: string
  readonly actions?: ReactNode
}

// One row shape for a bill and for a movement in the history. They are the
// same thing seen at two moments -- something owed, and the money that left
// when it was paid -- so per direct feedback they read the same way rather
// than being two layouts that happen to show the same fields.
//
// Four lines, always, in this order: what kind of thing it is, what it is
// called, when it is due or when it was paid, how much. Fixed so a column of
// them lines up instead of shuffling as one row's date wraps and another's
// does not.
//
// Home is deliberately not built on this: its carousel cards and its recent
// list are their own shapes and stay that way.
export function MovementCard({
  categoryName,
  categoryColor,
  CategoryIcon,
  title,
  when,
  isOverdue = false,
  amount,
  badge,
  meta,
  actions,
}: MovementCardProps): ReactElement {
  return (
    // Stacked on a phone, one row from `lg`. In a row everything centres
    // against the card's own height, so the icon and the buttons line up
    // with the middle of the block of text rather than with its first line.
    <div className="bg-card flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:gap-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden="true"
          data-testid="category-icon"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
          style={cssVars({ '--swatch-color': categoryColor })}
        >
          <CategoryIcon className="size-5 text-white" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge name={categoryName} color={categoryColor} />
            {badge}
          </div>
          <span className="truncate text-lg font-semibold text-foreground">
            {title}
          </span>
          <span
            className={cn(
              'text-xs',
              isOverdue ? 'text-error font-semibold' : 'text-muted-foreground',
            )}
          >
            {when}
            {meta === undefined ? null : (
              <>
                <span aria-hidden="true"> · </span>
                {meta}
              </>
            )}
          </span>
          {amount}
        </div>
      </div>
      {actions}
    </div>
  )
}

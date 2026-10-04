import type { ReactElement, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { cssVars } from '@/lib/cssVars'
import { inkForCategoryColor } from '@/lib/expenses/categoryColor'
import { cn } from '@/lib/utils'

export type MovementCardProps = {
  readonly categoryName: string
  readonly categoryColor: string
  // Resolved by the caller rather than looked up in here: it is one of a
  // fixed set of module-level components, but deriving it inside a component
  // body reads as creating a component during render (and trips the
  // static-components lint rule).
  readonly CategoryIcon: LucideIcon
  // Replaces the whole disc. For a row whose mark is not a category's --
  // a credit card wears its own brand, in the brand's own colours.
  readonly iconSlot?: ReactNode
  readonly title: string
  // The line under the title. Already phrased: "Vence el 06/09/2026",
  // "Pagado el 04/09/2026", "Tope $120.000". See lib/format's dueDateLabel
  // and paidDateLabel.
  readonly when: ReactNode
  // True when `when` says a bill has been missed, so it can be said in the
  // colour the rest of the app uses for that.
  readonly isOverdue?: boolean
  readonly amount: ReactNode
  // Sits beside the category badge: "Servicio" in Histórico, nothing in
  // Servicios (where every row is one).
  readonly badge?: ReactNode
  // Trails the date: who logged it, in Histórico.
  readonly meta?: string
  // False where the badge would only repeat the title -- a category's own
  // card, where the name is the heading.
  readonly showCategoryBadge?: boolean
  // The footer. Separated by a rule and pinned to the bottom, so a column of
  // these has its actions on one line however much text each one carries.
  readonly actions?: ReactNode
}

// The one card shape in the app: a bill, a movement in the history, and a
// category all read the same way.
//
// It is Home's "Últimos gastos del mes" row, which is the quietest of the
// shapes this replaced -- icon on the left, the name and the figure sharing
// the first line, and the category and the date beneath them at a whisper.
// The alternatives were a tall stack per row, which made a list of twenty
// read as twenty panels, and a wide row with the actions floating at the
// right edge, which left each card's buttons wherever its text happened to
// end. Per direct feedback.
//
// Four parts, always in this order: the category's disc, the title, the
// figure, and the quiet line under them -- then a footer, when there is
// anything to do.
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
  showCategoryBadge = true,
  iconSlot,
  actions,
}: MovementCardProps): ReactElement {
  return (
    // h-full so a card fills the height its row was given: in a grid the
    // row is as tall as its tallest card, and the footer has to sit at the
    // bottom of all of them, not just that one.
    <div className="bg-card card-surface flex h-full w-full flex-col gap-3 rounded-2xl p-4">
      <div className="flex w-full items-center gap-3">
        {iconSlot ?? (
          <span
            aria-hidden="true"
            data-testid="category-icon"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
            style={cssVars({
              '--swatch-color': categoryColor,
              '--swatch-ink': inkForCategoryColor(categoryColor),
            })}
          >
            <CategoryIcon
              className="size-5 text-[var(--swatch-ink)]"
              aria-hidden="true"
            />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Name and figure on one line: the name is what you scan for and
              the figure is what you came for, and side by side a column of
              these lines both of them up. */}
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-foreground truncate font-bold">{title}</span>
            {amount}
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {showCategoryBadge ? (
              <CategoryBadge name={categoryName} color={categoryColor} />
            ) : null}
            {badge}
            {/* Always its own line, whether or not it would have fit beside
                the badge: a row whose date sits next to the badge and the
                next one whose date has wrapped leaves a column of these
                looking ragged, and the date stops being findable in the
                same place every time. */}
            <span
              className={cn('w-full', isOverdue && 'text-error font-semibold')}
            >
              {when}
              {meta === undefined ? null : (
                <>
                  <span aria-hidden="true"> · </span>
                  {meta}
                </>
              )}
            </span>
          </div>
        </div>
      </div>
      {actions === undefined ? null : (
        <div className="border-border-subtle mt-auto flex flex-wrap items-center justify-end gap-2 border-t pt-3">
          {actions}
        </div>
      )}
    </div>
  )
}

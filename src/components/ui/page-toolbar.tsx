import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type PageToolbarProps = {
  // The month pager. Sits first and reads as the scope everything below is
  // in -- on both screens that is the first question: which month.
  readonly scope?: ReactNode
  // The search box. Given a fixed, modest width on a wide window; a search
  // field spanning 1200px looks like the page's main event, which it is not.
  readonly search?: ReactNode
  // The filter tabs. Their own baseline is what closes the toolbar.
  readonly tabs?: ReactNode
  // At most one page-level action, as a round icon button beside the search.
  readonly action?: ReactNode
  readonly className?: string
}

// The one toolbar both list screens use. Histórico and Servicios are the
// same screen with different rows in it, so they get the same controls in
// the same places -- per direct feedback, they had drifted into four
// separate full-width bands each (title+button, search, month, tabs, and
// then a loose button under all of it), stacked in a different order on
// each screen and with no hierarchy between them.
//
// One row on a wide window, two on a phone: scope on the left, and the
// things that narrow what is on screen gathered on the right. Nothing here
// spans the page except on a phone, where there is nothing to span.
export function PageToolbar({
  scope,
  search,
  tabs,
  action,
  className,
}: PageToolbarProps): ReactElement {
  return (
    <div
      className={cn(
        // No rule of its own: the month pager draws the line above and the
        // tabs draw the one below, so the block is bounded without a third.
        'flex w-full flex-col gap-4',
        className,
      )}
    >
      {/* Three rows on a phone -- month, search, tabs -- and two from `lg`,
          where the month and the search share a line and there is width for
          the search to be a modest field pinned right rather than a 1200px
          band across the page. */}
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-center lg:gap-3">
        {scope}
        {search === undefined && action === undefined ? null : (
          <div className="flex w-full items-center gap-2 lg:ml-auto lg:w-auto">
            {search === undefined ? null : (
              // Full width but for the button on a phone: sharing the row
              // with a filter as well, it had about 200px and the
              // placeholder was cut mid-word.
              <div className="min-w-0 flex-1 lg:w-72 lg:flex-none">
                {search}
              </div>
            )}
            {action}
          </div>
        )}
      </div>
      {/* Their baseline is what closes the whole block. */}
      {tabs}
    </div>
  )
}

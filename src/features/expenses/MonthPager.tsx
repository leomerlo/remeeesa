import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isDateInCurrentMonth } from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'

export type MonthPagerProps = {
  readonly viewedMonth: Date
  readonly onViewedMonthChange: (month: Date) => void
  // Lets the pager move past the current month. Off by default -- see
  // isAtForwardEdge below.
  readonly allowFuture?: boolean
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

// The month-paging row shared by every screen that browses one month at a
// time (Home's MonthNavigator, Categorías' breakdown) -- pulled out on its
// own so both get the same fix at once. Per direct feedback: the arrows used
// to be too small to comfortably tap and the label too small to read at a
// glance, so both are sized well past the default icon button/text here.
// "Next" stops at the current month unless a caller opts out: a future
// month has no Expenses yet, so paging into one would be a confusing way to
// reach a blank screen. Servicios opts out -- see allowFuture.
export function MonthPager({
  viewedMonth,
  onViewedMonthChange,
  allowFuture = false,
}: MonthPagerProps): ReactElement {
  // Paging past the current month is blocked by default: on Home and
  // Categorías a future month is guaranteed empty, so the arrow would only
  // ever lead somewhere with nothing in it. Servicios is the exception --
  // a bill's whole point is that it falls due later, so next month's list
  // is exactly what a household wants to look at.
  const isAtForwardEdge = !allowFuture && isDateInCurrentMonth(viewedMonth)

  return (
    // Month on the left, its two arrows together on the right -- the same
    // shape every other pager in the app has, rather than one arrow pinned
    // to each edge of the screen with the label marooned in between.
    //
    // The rule under it is the point: this control changes everything below
    // it, and without a line it read as just another heading in the stack
    // rather than as the scope the rest of the page is in. Per direct
    // feedback.
    <div className="border-border-subtle flex w-full items-center justify-between gap-2 border-b pb-3">
      <span
        role="status"
        aria-live="polite"
        className="text-foreground text-xl font-semibold"
      >
        {formatMonthLabel(viewedMonth)}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-mini"
          aria-label="Mes anterior"
          onClick={() => {
            onViewedMonthChange(addMonths(viewedMonth, -1))
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-mini"
          aria-label="Mes siguiente"
          disabled={isAtForwardEdge}
          onClick={() => {
            onViewedMonthChange(addMonths(viewedMonth, 1))
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

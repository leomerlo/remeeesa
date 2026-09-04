import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isDateInCurrentMonth } from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'

export type MonthPagerProps = {
  readonly viewedMonth: Date
  readonly onViewedMonthChange: (month: Date) => void
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

// The month-paging row shared by every screen that browses one month at a
// time (Home's MonthNavigator, Categorías' breakdown) -- pulled out on its
// own so both get the same fix at once. Per direct feedback: the arrows used
// to be too small to comfortably tap and the label too small to read at a
// glance, so both are sized well past the default icon button/text here.
// "Next" stops at the current month: a future month has no Expenses yet and
// nothing to show, so paging into one would just be a confusing way to reach
// a blank screen.
export function MonthPager({
  viewedMonth,
  onViewedMonthChange,
}: MonthPagerProps): ReactElement {
  const isCurrentMonth = isDateInCurrentMonth(viewedMonth)

  return (
    <div className="flex w-full items-center justify-between">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Mes anterior"
        onClick={() => {
          onViewedMonthChange(addMonths(viewedMonth, -1))
        }}
      >
        <ChevronLeft aria-hidden="true" className="size-7" />
      </Button>
      <span
        role="status"
        aria-live="polite"
        className="text-foreground text-xl font-semibold"
      >
        {formatMonthLabel(viewedMonth)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Mes siguiente"
        disabled={isCurrentMonth}
        onClick={() => {
          onViewedMonthChange(addMonths(viewedMonth, 1))
        }}
      >
        <ChevronRight aria-hidden="true" className="size-7" />
      </Button>
    </div>
  )
}

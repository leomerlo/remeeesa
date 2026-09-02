import { useState } from 'react'
import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentMonthRange } from '@/lib/expenses'
import { formatMonthLabel } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { RemainingBudgetDisplay } from './RemainingBudgetDisplay'
import { SpentThisMonthDisplay } from './SpentThisMonthDisplay'

export type MonthNavigatorProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Uncontrolled by default (owns its own month via internal state, as
  // before). Pass both to control it -- HomePage does, so paging the
  // month here also moves every other month-scoped section on the page.
  readonly viewedMonth?: Date
  readonly onViewedMonthChange?: (month: Date) => void
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1)
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

// Owns which month Home's two budget cards are showing, and pages both of
// them together -- there's exactly one month in view at a time, never one
// card ahead of the other. "Next" stops at the current month: a future
// month has no Expenses yet and nothing to show, so paging into one would
// just be a confusing way to reach a blank card.
export function MonthNavigator({
  db,
  householdId,
  viewedMonth: viewedMonthProp,
  onViewedMonthChange,
}: MonthNavigatorProps): ReactElement {
  const [internalViewedMonth, setInternalViewedMonth] = useState(() =>
    startOfMonth(new Date()),
  )
  const viewedMonth = viewedMonthProp ?? internalViewedMonth
  const setViewedMonth = onViewedMonthChange ?? setInternalViewedMonth
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)
  const isCurrentMonth = isSameMonth(viewedMonth, new Date())

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mes anterior"
          onClick={() => {
            setViewedMonth(addMonths(viewedMonth, -1))
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <span
          role="status"
          aria-live="polite"
          className="text-foreground text-sm font-semibold"
        >
          {formatMonthLabel(viewedMonth)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Mes siguiente"
          disabled={isCurrentMonth}
          onClick={() => {
            setViewedMonth(addMonths(viewedMonth, 1))
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <SpentThisMonthDisplay
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
      <RemainingBudgetDisplay
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        monthEnd={monthEnd}
      />
    </div>
  )
}

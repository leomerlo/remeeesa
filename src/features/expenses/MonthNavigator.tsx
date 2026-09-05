import { useState } from 'react'
import type { ReactElement } from 'react'
import { currentMonthRange } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { MonthPager } from './MonthPager'
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

// Owns which month Home's two budget cards are showing, and pages both of
// them together -- there's exactly one month in view at a time, never one
// card ahead of the other. The paging row itself is MonthPager, shared with
// Categorías.
export function MonthNavigator({
  db,
  householdId,
  viewedMonth: viewedMonthProp,
  onViewedMonthChange,
}: MonthNavigatorProps): ReactElement {
  const [internalViewedMonth, setInternalViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  const viewedMonth = viewedMonthProp ?? internalViewedMonth
  const setViewedMonth = onViewedMonthChange ?? setInternalViewedMonth
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)

  return (
    <div className="flex w-full flex-col gap-3">
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
      />
      {/* Peers -- one counts up, the other counts down -- so on a wide
          window they sit next to each other and can be read in one glance
          instead of one scrolling the other off. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4 lg:*:flex-1">
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
    </div>
  )
}

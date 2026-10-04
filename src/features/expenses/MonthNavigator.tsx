import { useState } from 'react'
import type { ReactElement } from 'react'
import { currentMonthRange } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { MonthPager } from './MonthPager'
import { EditMonthBudgetSheet } from './EditMonthBudgetSheet'
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
  // Forwarded to MonthPager.
  readonly maxMonthsAhead?: number
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
  maxMonthsAhead,
}: MonthNavigatorProps): ReactElement {
  const [internalViewedMonth, setInternalViewedMonth] = useState(
    () => currentMonthRange().monthStart,
  )
  // Held here rather than inside the sheet because two different things
  // open it: its own button once there is a budget, and the empty card's
  // "Poner presupuesto" before there is one.
  const [isBudgetSheetOpen, setIsBudgetSheetOpen] = useState(false)
  const viewedMonth = viewedMonthProp ?? internalViewedMonth
  const setViewedMonth = onViewedMonthChange ?? setInternalViewedMonth
  const { monthStart, monthEnd } = currentMonthRange(viewedMonth)

  return (
    <div className="flex w-full flex-col gap-3">
      <MonthPager
        viewedMonth={viewedMonth}
        onViewedMonthChange={setViewedMonth}
        {...(maxMonthsAhead === undefined ? {} : { maxMonthsAhead })}
      />
      {/* Not peers any more: what is left is the question this app exists
          to answer, and what has gone is how it got there. So the coloured
          card leads and takes the larger share, and the white one reads as
          its supporting figure. Per direct feedback. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <RemainingBudgetDisplay
          db={db}
          householdId={householdId}
          monthStart={monthStart}
          monthEnd={monthEnd}
          onSetBudget={() => {
            setIsBudgetSheetOpen(true)
          }}
        />
        <SpentThisMonthDisplay
          db={db}
          householdId={householdId}
          monthStart={monthStart}
          monthEnd={monthEnd}
        />
      </div>
      {/* Under the pair it belongs to, not in Ajustes: the budget is a
          property of the month, and this is where the month is. */}
      <EditMonthBudgetSheet
        db={db}
        householdId={householdId}
        monthStart={monthStart}
        open={isBudgetSheetOpen}
        onOpenChange={setIsBudgetSheetOpen}
      />
    </div>
  )
}

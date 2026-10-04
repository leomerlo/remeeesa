import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { Wallet } from 'lucide-react'
import { Illustration } from '@/components/Illustration'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cssVars } from '@/lib/cssVars'
import { cn } from '@/lib/utils'
import { householdQueryKey } from '@/features/household'
import {
  budgetTone,
  budgetToneClass,
  budgetToneLabel,
  computePendingCommitted,
  computePercentUsed,
  computeRemainingBudget,
  currentMonthRange,
  formatBudgetAmount,
  formatCurrency,
  listExpensesInMonth,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { getHousehold, monthlyBudgetFor } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { expensesInMonthQueryKey } from './queryKeys'

export type RemainingBudgetDisplayProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // Opens the month's budget form. Only ever used by the empty state below:
  // once there is a budget this card is a figure, not an action, and the
  // "Editar presupuesto del mes" button under the pair is the way back in.
  readonly onSetBudget?: () => void
  // Defaults to the current month. MonthNavigator passes the month it's
  // paging through instead -- this card has no month-picking UI of its own,
  // it just renders whatever range it's given.
  readonly monthStart?: Date
  readonly monthEnd?: Date
}

export function RemainingBudgetDisplay({
  db,
  householdId,
  monthStart: monthStartProp,
  monthEnd: monthEndProp,
  onSetBudget,
}: RemainingBudgetDisplayProps): ReactElement {
  const householdQuery = useQuery({
    queryKey: householdQueryKey({ householdId }),
    queryFn: () => getHousehold({ db, householdId }),
  })
  const defaultRange = useMemo(() => currentMonthRange(), [])
  const monthStart = monthStartProp ?? defaultRange.monthStart
  const monthEnd = monthEndProp ?? defaultRange.monthEnd
  // The query key changes with the viewed month, so paging keeps each
  // month's expenses cached under its own entry instead of refetching the
  // same month every time it's revisited.
  const expensesQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({
        db,
        householdId,
        monthStart,
        monthEnd,
      }),
  })
  // Per direct feedback: a Pendiente still owed has to count against what's
  // "left" too, but only for the month it's actually due in -- see
  // SpentThisMonthDisplay's identical query for the full reasoning (shares
  // its cache entry).
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })
  const household = householdQuery.data
  const expenses = expensesQuery.data
  const pending = pendingQuery.data

  if (
    household === undefined ||
    expenses === undefined ||
    pending === undefined
  ) {
    // Neutral rather than the eventual heat colour: a pulsing grey bar over
    // the filled card would read as broken, not loading. The colour (and
    // the mascot) only appear once there's a real figure to show inside it.
    return (
      <div
        role="status"
        aria-label="Cargando…"
        className="bg-card card-surface flex w-full flex-col gap-6 rounded-3xl p-6"
      >
        <span className="sr-only">Cargando…</span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-11 w-52" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    )
  }

  // No budget set (see parseMonthlyBudget: zero is a real state, not an
  // error). There is nothing to count down from, so the card says so and
  // offers to fix it rather than rendering "restante: -$48.350" against a
  // budget of nothing, or a progress bar that is full from the first gasto.
  // Light, not the dark filled one: that card's whole job is showing heat,
  // and with no budget there is no heat to show.
  const monthlyBudget = monthlyBudgetFor(household, monthStart)

  if (monthlyBudget === 0) {
    return (
      // Dashed and unfilled rather than the solid card a real budget gets:
      // it is a slot waiting to be filled, in the exact place and width the
      // coloured card will take. It used to be the whole card as a link to
      // Ajustes with no art and no button -- which stopped being true when
      // the budget moved onto this page, and read as a placeholder nobody
      // had finished. So: the mascot doing the one thing this card is
      // asking for, a real heading, and the button that opens the form. It
      // is the only trigger in this state -- EditMonthBudgetSheet hides its
      // own while there is no budget. Per direct feedback.
      <div className="border-border flex w-full flex-col items-center gap-5 rounded-3xl border-2 border-dashed p-6 text-center lg:flex-[3] lg:flex-row lg:items-center lg:gap-6 lg:text-left">
        <span
          aria-hidden="true"
          className="bg-muted flex size-28 shrink-0 items-center justify-center rounded-full"
        >
          <Illustration src={ILLUSTRATIONS.counting} className="size-20" />
        </span>
        <div className="flex min-w-0 flex-col items-center gap-3 lg:items-start">
          <div className="flex flex-col gap-1.5">
            <p className="text-title font-semibold">Presupuesto del mes</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Todavía no pusieron uno. Ponelo y cada gasto se descuenta de ahí.
            </p>
          </div>
          {onSetBudget === undefined ? null : (
            <Button
              type="button"
              onClick={() => {
                onSetBudget()
              }}
            >
              <Wallet aria-hidden="true" />
              Poner presupuesto
            </Button>
          )}
        </div>
      </div>
    )
  }

  const pendingCommitted = computePendingCommitted(
    pendientesDueInMonth(pending, monthStart, monthEnd),
  )
  const remaining = computeRemainingBudget(
    monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const formattedRemaining = formatBudgetAmount(remaining)
  // What the month has taken out of the budget so far, derived from the
  // remainder rather than re-summed, so the two figures on this card can
  // never disagree. Overspending is allowed to read as more than the
  // budget ("$950.000 de $900.000") -- that is the situation.
  const used = monthlyBudget - remaining
  const percentUsed = computePercentUsed(
    monthlyBudget,
    expenses,
    pendingCommitted,
  )
  const tone = budgetTone(percentUsed)

  return (
    <div
      // The card's own colour says how much of the budget is gone before
      // any of it is read: celeste while there is room, naranja once it is
      // getting tight, fucsia with no margin left. One of three gradient
      // cards rather than a computed colour -- see lib/expenses/budgetHeat.
      className={cn(
        // Only the fill animates between tones. transition-colors also
        // animates `color`, so on the first paint the figure started at the
        // inherited near-black and faded to white -- a flash of the wrong
        // colour on the one card whose text is always white.
        'text-on-stat relative flex w-full flex-col gap-6 rounded-3xl p-6 transition-[background-color,background-image] duration-500 lg:flex-[3]',
        budgetToneClass(tone),
      )}
    >
      <div className="flex flex-col gap-2">
        {/* No month label here -- MonthNavigator (Home's shared control
            above both cards) is the one place that says which month is
            being viewed now; repeating it on every card it renders was
            three copies of the same sentence. */}
        {/* "Te quedan" rather than "Presupuesto restante": the three
            figures of a month are the budget, what is gone and what is
            left, and this card is the third of them. Said the way someone
            would say it out loud. */}
        <span className="text-body font-medium text-white/90">Te quedan</span>
        <p
          role="status"
          aria-label={`Te quedan ${formattedRemaining}. ${budgetToneLabel(percentUsed)}.`}
          className="font-heading text-display tabular-money font-extrabold tracking-tight text-white"
        >
          {formattedRemaining}
        </p>
        {/* The colour said in words, for anyone not reading the colour --
            and the percentage beside it, since the two are the same fact
            said twice over: "Casi sin margen · 96% usado". It used to sit
            at the far end of the line under the bar, where it was a number
            with nothing to attach itself to. Per direct feedback. */}
        <span className="text-xs font-bold text-white/90">
          {budgetToneLabel(percentUsed)}
          <span aria-hidden="true"> · </span>
          {percentUsed}% usado
        </span>
      </div>
      <div className="flex w-full flex-col gap-1">
        <div
          role="progressbar"
          aria-label="% usado"
          aria-valuenow={Math.min(100, percentUsed)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-white/30"
        >
          <div
            className="h-full w-[var(--progress)] rounded-full bg-white transition-[width]"
            style={cssVars({ '--progress': `${String(percentUsed)}%` })}
          />
        </div>
        {/* The budget itself, which the card otherwise never states: it
            only ever showed what was left and a percentage, so the figure
            those are measured against was nowhere on screen. Per direct
            feedback. Named, not just implied by "de": the month has three
            figures and this is the one the other two are measured against. */}
        <div className="text-xs font-medium text-white/90">
          En uso {formatCurrency(used)} de{' '}
          {/* The budget itself in bold: it is the figure the other two are
              measured against, and in one flat run of text it read as the
              least important thing on the line. */}
          <span className="font-bold">{formatCurrency(monthlyBudget)}</span>
        </div>
      </div>
    </div>
  )
}

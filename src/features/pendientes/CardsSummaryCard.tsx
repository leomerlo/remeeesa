import { useState } from 'react'
import type { ReactElement } from 'react'
import { RESUMEN_CATEGORY_NAME, resumenTotals } from '@/lib/cards'
import { formatAmount } from '@/lib/expenses'
import {
  colorForCategoryName,
  inkForCategoryColor,
} from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { cssVars } from '@/lib/cssVars'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import type { Pendiente } from '@/lib/pendientes'
import { CardsNextMonthSheet } from './CardsNextMonthSheet'

export type CardsSummaryCardProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly resumenes: readonly Pendiente[]
  readonly categories: readonly Category[]
  // What this set of Resúmenes is, in the words of the screen it sits on:
  // "el mes que viene" on Home, "este mes" on Servicios.
  readonly title: string
  readonly subtitle: string
  readonly headingId: string
  // Passed on to the detail sheet; see CardsNextMonthSheet.
  readonly onPay?: (resumen: Pendiente) => void
  readonly detailTitle?: string
}

// Resolved once at module level, not per render: the name is a constant, so
// the icon is too.
const ResumenIcon = iconForCategoryName(RESUMEN_CATEGORY_NAME)

// One card standing for every card statement in a set: a figure per
// currency, and the whole thing opens into the consumos behind it.
//
// Shared by Home and Servicios on purpose. Servicios used to list each
// Resumen as its own row under "Por pagar", labelled ESTIMADO -- four rows
// for two cards, with an invented due date, in a group that said they were
// owed when the app's whole position is that an estimate is owed by nobody.
// Per direct feedback: que siga la misma lógica de lo de la home.
export function CardsSummaryCard({
  db,
  householdId,
  resumenes,
  categories,
  title,
  subtitle,
  headingId,
  onPay,
  detailTitle,
}: CardsSummaryCardProps): ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)
  const totals = resumenTotals(resumenes)
  if (totals.length === 0) {
    return null
  }

  // Its own category's colour and icon, the same pair every servicio row
  // wears.
  const category = categories.find(
    (candidate) => candidate.name === RESUMEN_CATEGORY_NAME,
  )
  const color = category?.color ?? colorForCategoryName(RESUMEN_CATEGORY_NAME)

  return (
    <>
      {/* The whole card opens the detail: the figure is a summary of
          movements, and the obvious thing to want is to see them. A button,
          not a link -- nothing navigates, it opens a read-only sheet. */}
      <button
        type="button"
        aria-labelledby={headingId}
        onClick={() => {
          setIsOpen(true)
        }}
        className="bg-card card-surface focus-visible:ring-ring/50 hover:border-foreground flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors outline-none focus-visible:ring-3"
        style={cssVars({
          '--swatch-color': color,
          '--swatch-ink': inkForCategoryColor(color),
        })}
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--swatch-color)]"
        >
          <ResumenIcon
            className="size-5 text-[var(--swatch-ink)]"
            aria-hidden="true"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={headingId}
            className="text-body text-foreground font-medium"
          >
            {title}
          </span>
          <span className="text-muted-foreground text-xs">{subtitle}</span>
        </div>
        {/* One under the other when there are two, each in its own currency
            -- they are separate bills, never one sum. */}
        <div className="flex shrink-0 flex-col items-end">
          {totals.map(({ currency, total }) => (
            <span key={currency} className="money text-foreground text-xl">
              {formatAmount(total, currency)}
            </span>
          ))}
        </div>
      </button>
      <CardsNextMonthSheet
        db={db}
        householdId={householdId}
        resumenes={resumenes}
        open={isOpen}
        onOpenChange={setIsOpen}
        {...(detailTitle === undefined ? {} : { title: detailTitle })}
        {...(onPay === undefined
          ? {}
          : {
              onPay: (resumen: Pendiente) => {
                setIsOpen(false)
                onPay(resumen)
              },
            })}
      />
    </>
  )
}

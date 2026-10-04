import type { ReactElement } from 'react'
import { formatCompactCurrency } from '@/lib/expenses'
import type { CategorySummary } from '@/lib/expenses'

export type CategoryDonutProps = {
  readonly summary: readonly CategorySummary[]
  // The figure for the hole. Omitted leaves the hole empty, which is what
  // the places that already print the total right beside the ring want.
  readonly total?: number
}

// Geometry in the SVG's own user units; the element is scaled by CSS.
const SIZE = 120
// A thick ring, not a thin one: at 18 the arcs read as lines drawn around a
// large hole, and the small slices of a month with many categories almost
// disappeared. At 26 each slice is a band with enough body to be told apart
// at a glance, which is the only thing this graphic is for.
const STROKE = 26
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Hand-rolled rather than pulling in a charting library for one donut: the
// whole thing is a stack of circles sharing one stroke-dasharray trick, where
// each arc is drawn as a dash exactly as long as its share of the
// circumference and pushed around the ring by the shares before it.
//
// Decorative by design: every slice's name, amount and percentage is printed
// in the list beside it, so the graphic is aria-hidden rather than repeating
// all of it to a screen reader as a meaningless blob of numbers.
//
// The month's total sits in the hole, which is what the ring is a breakdown
// *of* -- without it the graphic is shares of an amount stated nowhere near
// it. Full precision does not fit ("$1.883.200,50" collides with the ring at
// any size this is rendered), so the hole carries a rounded figure and the
// exact one stays in the rows underneath.
type Arc = {
  readonly categoryId: string
  readonly color: string
  readonly dash: number
  readonly offset: number
}

// Resolved up front rather than by accumulating during the render pass: each
// arc's offset depends on every share before it, and running that total
// inside the JSX would mean mutating state while React renders.
function arcsFor(summary: readonly CategorySummary[]): readonly Arc[] {
  const arcs: Arc[] = []
  let sweptSoFar = 0
  for (const entry of summary) {
    arcs.push({
      categoryId: entry.categoryId,
      color: entry.color,
      dash: entry.share * CIRCUMFERENCE,
      offset: -sweptSoFar * CIRCUMFERENCE,
    })
    sweptSoFar += entry.share
  }
  return arcs
}

export function CategoryDonut({
  summary,
  total,
}: CategoryDonutProps): ReactElement {
  const arcs = arcsFor(summary)

  return (
    <div className="relative shrink-0">
      <svg
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="size-36 -rotate-90"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={STROKE}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.categoryId}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${String(arc.dash)} ${String(CIRCUMFERENCE)}`}
            strokeDashoffset={String(arc.offset)}
          />
        ))}
      </svg>
      {total === undefined ? null : (
        // Outside the SVG and un-rotated: the ring is drawn rotated -90deg
        // so it starts at twelve o'clock, and text inside it would be
        // rotated with it.
        <div
          aria-hidden="true"
          className="absolute inset-0 flex flex-col items-center justify-center gap-0.5"
        >
          {/* text-xs, not an arbitrary 10px: nothing in this app renders
              below 14px, decorative or not (see a11y/tokens.test). */}
          <span className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
            Total
          </span>
          <span className="money text-foreground text-base">
            {formatCompactCurrency(total)}
          </span>
        </div>
      )}
    </div>
  )
}

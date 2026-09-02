import type { ReactElement } from 'react'
import type { CategorySummary } from '@/lib/expenses'

export type CategoryDonutProps = {
  readonly summary: readonly CategorySummary[]
}

// Geometry in the SVG's own user units; the element is scaled by CSS.
const SIZE = 120
const STROKE = 18
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
// Nothing is printed in the hole. A month's total in pesos runs to
// "$250.000,00", which overflows a 90px hole and collides with the ring, so
// the total belongs in the section heading where it has room.
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

export function CategoryDonut({ summary }: CategoryDonutProps): ReactElement {
  const arcs = arcsFor(summary)

  return (
    <div className="relative shrink-0">
      <svg
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="size-32 -rotate-90"
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
    </div>
  )
}

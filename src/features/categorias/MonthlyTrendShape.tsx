import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'

export type MonthlyTrendPoint = {
  readonly label: string
  readonly total: number
}

export type MonthlyTrendShapeProps = {
  readonly points: readonly MonthlyTrendPoint[]
  readonly selectedIndex: number | null
  readonly onSelect: (index: number | null) => void
  readonly formatAmount: (amount: number) => string
  // How a gridline's amount is written down the left edge: short enough to
  // sit in a 56px gutter, so "$1.041.120,50" becomes "$1,04 M".
  readonly formatTick: (amount: number) => string
}

// Four lines including the baseline: enough to read a height against,
// few enough that they stay a background.
const TICK_COUNT = 3

// A round number at or above the highest month, so the top line is a figure
// anyone can hold in their head rather than the exact maximum.
function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1
  }
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (candidate >= value) {
      return candidate
    }
  }
  return 10 * magnitude
}

// Geometry in the SVG's own user units; CSS scales the element. The box is
// wide and shallow on purpose -- a trend is read as a slope, and a tall
// narrow plot turns an ordinary month-to-month wobble into a cliff.
const WIDTH = 600
const HEIGHT = 200
const PAD_TOP = 18
const PAD_BOTTOM = 26
// Room down the left for the scale: without it the first month's dot sat
// on top of its own figure.
const PAD_LEFT = 62
const PAD_X = 14

// Monotone cubic: the curve is only allowed to turn where the data does.
// A plain Catmull-Rom (or any symmetric spline) overshoots on a spike --
// it would dip below zero on the way into a big month and invent a month
// that spent less than nothing.
function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) {
    return ''
  }
  const first = points[0] as readonly [number, number]
  if (points.length < 3) {
    return points
      .slice(1)
      .reduce(
        (path, [x, y]) => `${path} L${String(x)},${String(y)}`,
        `M${String(first[0])},${String(first[1])}`,
      )
  }
  const count = points.length
  const dx: number[] = []
  const slopes: number[] = []
  for (let i = 0; i < count - 1; i += 1) {
    const [x0, y0] = points[i] as readonly [number, number]
    const [x1, y1] = points[i + 1] as readonly [number, number]
    dx.push(x1 - x0)
    slopes.push((y1 - y0) / (x1 - x0))
  }
  const tangents: number[] = [slopes[0] ?? 0]
  for (let i = 1; i < count - 1; i += 1) {
    const before = slopes[i - 1] ?? 0
    const after = slopes[i] ?? 0
    // A turning point gets a flat tangent, which is what stops the curve
    // sailing past a peak and coming back to it.
    tangents.push(before * after <= 0 ? 0 : (before + after) / 2)
  }
  tangents.push(slopes[count - 2] ?? 0)
  for (let i = 0; i < count - 1; i += 1) {
    const slope = slopes[i] ?? 0
    if (slope === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = (tangents[i] ?? 0) / slope
    const b = (tangents[i + 1] ?? 0) / slope
    const magnitude = a * a + b * b
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude)
      tangents[i] = scale * a * slope
      tangents[i + 1] = scale * b * slope
    }
  }
  let path = `M${String(first[0])},${String(first[1])}`
  for (let i = 0; i < count - 1; i += 1) {
    const [x0, y0] = points[i] as readonly [number, number]
    const [x1, y1] = points[i + 1] as readonly [number, number]
    const handle = (dx[i] ?? 0) / 3
    const c1 = `${String(x0 + handle)},${String(y0 + (tangents[i] ?? 0) * handle)}`
    const c2 = `${String(x1 - handle)},${String(y1 - (tangents[i + 1] ?? 0) * handle)}`
    path += ` C${c1} ${c2} ${String(x1)},${String(y1)}`
  }
  return path
}

// The month-to-month trend, as a curve over a soft wash of its own colour.
//
// It was six bars. Bars answer "how much in March" one month at a time;
// this chart is not asked that -- the figure for any one month is a tap
// away and in every bar's accessible name either way. What it is asked is
// "is this month unusual", and a line answers that in its shape. Per direct
// feedback, after the reference system this app's look came from.
export function MonthlyTrendShape({
  points,
  selectedIndex,
  onSelect,
  formatAmount,
  formatTick,
}: MonthlyTrendShapeProps): ReactElement {
  // The scale tops out at a round number, not at the tallest month: with
  // the peak pinned to the ceiling there was no headroom and no way to tell
  // how high "high" was.
  const maxTotal = niceCeiling(Math.max(...points.map((p) => p.total), 1))
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM
  const plotWidth = WIDTH - PAD_LEFT - PAD_X
  const xAt = (index: number): number =>
    points.length === 1
      ? PAD_LEFT + plotWidth / 2
      : PAD_LEFT + (index * plotWidth) / (points.length - 1)
  const yAt = (total: number): number =>
    PAD_TOP + plotHeight - (Math.max(0, total) / maxTotal) * plotHeight

  const coordinates = points.map(
    (point, index) => [xAt(index), yAt(point.total)] as const,
  )
  const line = smoothPath(coordinates)
  const baseline = PAD_TOP + plotHeight
  const area =
    line === ''
      ? ''
      : `${line} L${String(xAt(points.length - 1))},${String(baseline)} L${String(xAt(0))},${String(baseline)} Z`

  return (
    <div className="w-full">
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          className="h-40 w-full lg:h-52"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0"
                stopColor="var(--trend-line)"
                stopOpacity="0.28"
              />
              <stop offset="1" stopColor="var(--trend-line)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Gridlines, dashed and quiet: they give the curve something to
              be tall against without competing with it. One per step of the
              scale printed down the left edge. Per direct feedback. */}
          {Array.from({ length: TICK_COUNT }, (_, index) => {
            const y = PAD_TOP + (plotHeight * index) / TICK_COUNT
            return (
              <line
                key={y}
                x1={PAD_LEFT}
                x2={WIDTH - PAD_X}
                y1={y}
                y2={y}
                stroke="var(--color-border-subtle)"
                strokeWidth="1"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            )
          })}
          {/* The baseline is solid: it is zero, which is a fact rather than
              a reference. */}
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_X}
            y1={baseline}
            y2={baseline}
            stroke="var(--color-border-subtle)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <path d={area} fill="url(#trend-wash)" />
          <path
            d={line}
            fill="none"
            stroke="var(--trend-line)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* The dots and the hit areas live in the DOM, not the SVG.
          preserveAspectRatio="none" is what lets the curve fill a card of
          any width, but it scales x and y differently -- so a <circle> in
          there came out as an ellipse, wide on a monitor and pinched on a
          phone. Positioned here in percentages they stay round at every
          size. (The line survives it because its stroke is
          non-scaling-stroke and a curve has no aspect to distort.) */}
        {/* The scale down the left edge. In the DOM, not the SVG, for the
          same reason the dots are: preserveAspectRatio="none" would stretch
          the text with the drawing. */}
        {Array.from({ length: TICK_COUNT }, (_, index) => {
          const share = 1 - index / TICK_COUNT
          return (
            <span
              key={share}
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute left-0 -translate-y-1/2 text-xs"
              style={{
                top: `${String(((PAD_TOP + (plotHeight * index) / TICK_COUNT) / HEIGHT) * 100)}%`,
              }}
            >
              {formatTick(maxTotal * share)}
            </span>
          )
        })}
        {coordinates.map(([x, y], index) => (
          <span
            key={points[index]?.label ?? index}
            aria-hidden="true"
            className={cn(
              'border-trend bg-card pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px]',
              index === selectedIndex ? 'size-3.5' : 'size-2.5',
            )}
            style={{
              left: `${String((x / WIDTH) * 100)}%`,
              top: `${String((y / HEIGHT) * 100)}%`,
            }}
          />
        ))}
        <ul
          aria-label="Gasto total por mes"
          className="absolute inset-0 flex items-stretch"
        >
          {points.map((point, index) => {
            const isSelected = index === selectedIndex
            return (
              <li key={point.label} className="relative flex-1">
                {isSelected ? (
                  <div
                    role="tooltip"
                    className="bg-foreground text-background pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 rounded-lg px-2 py-1 text-xs font-semibold whitespace-nowrap"
                    style={{
                      top: `${String((yAt(point.total) / HEIGHT) * 100)}%`,
                      marginTop: '-2.25rem',
                    }}
                  >
                    {formatAmount(point.total)}
                  </div>
                ) : null}
                <button
                  type="button"
                  aria-expanded={isSelected}
                  aria-label={`${point.label}: ${formatAmount(point.total)}`}
                  className="focus-visible:ring-ring/50 h-full w-full rounded-lg outline-none focus-visible:ring-3"
                  onClick={() => {
                    onSelect(isSelected ? null : index)
                  }}
                />
              </li>
            )
          })}
        </ul>
      </div>
      <ul
        aria-hidden="true"
        className="text-muted-foreground mt-1 flex items-stretch text-xs"
        style={{ marginLeft: `${String((PAD_LEFT / WIDTH) * 100)}%` }}
      >
        {points.map((point) => (
          <li key={point.label} className="flex-1 text-center">
            {point.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

import { useId } from 'react'
import type { ReactElement } from 'react'

export type EmptyExpensesIllustrationProps = {
  readonly className?: string
}

// Decorative empty-tray motif for the "no expenses this month" state. Same
// hand-authored inline SVG technique as OnboardingIllustration (gradient
// fill, soft highlight, drop-shadow, floating accents) so the two read as
// one visual family.
export function EmptyExpensesIllustration({
  className,
}: EmptyExpensesIllustrationProps): ReactElement {
  const id = useId()
  const trayGradientId = `${id}-tray`
  const highlightGradientId = `${id}-highlight`
  const shadowFilterId = `${id}-shadow`

  return (
    <svg
      viewBox="0 0 200 160"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={trayGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-purple-400)" />
          <stop offset="100%" stopColor="var(--color-purple-200)" />
        </linearGradient>
        <radialGradient id={highlightGradientId}>
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <filter
          id={shadowFilterId}
          x="-50%"
          y="-50%"
          width="200%"
          height="200%"
        >
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="6"
            floodColor="var(--color-purple-900)"
            floodOpacity="0.2"
          />
        </filter>
      </defs>

      <g filter={`url(#${shadowFilterId})`}>
        {/* Tray back wall */}
        <path
          d="M40 70 L160 70 L150 100 L50 100 Z"
          fill="var(--color-purple-300)"
        />
        {/* Tray front basin */}
        <path
          d="M30 100 L170 100 L155 132 Q150 138 143 138 L57 138 Q50 138 45 132 Z"
          fill={`url(#${trayGradientId})`}
        />
        {/* Rim highlight */}
        <ellipse
          cx="75"
          cy="82"
          rx="24"
          ry="8"
          fill={`url(#${highlightGradientId})`}
        />
        {/* Empty-state dashes floating inside the tray */}
        <rect x="82" y="108" width="36" height="4" rx="2" fill="var(--color-purple-500)" opacity="0.4" />
      </g>

      {/* Floating accent shapes */}
      <g filter={`url(#${shadowFilterId})`}>
        <circle cx="158" cy="42" r="9" fill="var(--color-green-400)" />
        <circle cx="32" cy="56" r="6" fill="var(--color-yellow-400)" />
      </g>
    </svg>
  )
}

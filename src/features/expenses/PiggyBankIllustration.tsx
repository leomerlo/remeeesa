import { useId } from 'react'
import type { ReactElement } from 'react'

export type PiggyBankIllustrationProps = {
  readonly className?: string
}

// Decorative piggy-bank motif for the balance card. Same hand-authored
// inline SVG technique as EmptyExpensesIllustration/OnboardingIllustration
// (gradient fill, soft highlight via radial gradient, feDropShadow filter,
// floating accents -- here "floating coins" instead of tray dashes/circles)
// so all three read as one visual family.
export function PiggyBankIllustration({
  className,
}: PiggyBankIllustrationProps): ReactElement {
  const id = useId()
  const bodyGradientId = `${id}-body`
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
        <linearGradient id={bodyGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-purple-200)" />
          <stop offset="100%" stopColor="var(--color-purple-400)" />
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
        {/* Legs */}
        <rect x="55" y="118" width="10" height="14" rx="3" fill="var(--color-purple-500)" />
        <rect x="135" y="118" width="10" height="14" rx="3" fill="var(--color-purple-500)" />
        {/* Ear */}
        <path d="M60 58 L48 42 L70 50 Z" fill={`url(#${bodyGradientId})`} />
        {/* Body */}
        <ellipse
          cx="100"
          cy="92"
          rx="58"
          ry="40"
          fill={`url(#${bodyGradientId})`}
        />
        {/* Snout */}
        <ellipse cx="152" cy="94" rx="14" ry="11" fill="var(--color-purple-300)" />
        <ellipse cx="148" cy="94" rx="2.5" ry="3.5" fill="var(--color-purple-700)" />
        <ellipse cx="157" cy="94" rx="2.5" ry="3.5" fill="var(--color-purple-700)" />
        {/* Eye */}
        <circle cx="118" cy="80" r="3.5" fill="var(--color-purple-900)" />
        {/* Coin slot */}
        <rect x="90" y="58" width="24" height="4" rx="2" fill="var(--color-purple-700)" />
        {/* Body highlight */}
        <ellipse
          cx="80"
          cy="76"
          rx="22"
          ry="12"
          fill={`url(#${highlightGradientId})`}
        />
      </g>

      {/* Floating coins */}
      <g filter={`url(#${shadowFilterId})`}>
        <circle cx="158" cy="34" r="10" fill="var(--color-yellow-400)" />
        <circle cx="158" cy="34" r="10" fill="none" stroke="var(--color-yellow-600)" strokeOpacity="0.4" />
        <circle cx="28" cy="50" r="7" fill="var(--color-green-400)" />
        <circle cx="170" cy="66" r="6" fill="var(--color-yellow-400)" />
      </g>
    </svg>
  )
}

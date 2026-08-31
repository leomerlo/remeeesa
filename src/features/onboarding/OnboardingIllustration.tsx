import { useId } from 'react'
import type { ReactElement } from 'react'

export type OnboardingIllustrationProps = {
  readonly className?: string
}

// Decorative piggy-bank motif for the household-creation step. Hand-authored
// inline SVG (no illustration asset pipeline exists in this repo) using the
// wallet palette's primary purple -> lavender-pink gradient, a soft highlight
// ellipse, a drop-shadow filter, and floating accent coins for a semi-3D,
// flat-illustration-with-depth look consistent with RemainingBudgetDisplay.
export function OnboardingIllustration({
  className,
}: OnboardingIllustrationProps): ReactElement {
  const id = useId()
  const bodyGradientId = `${id}-body`
  const coinGradientId = `${id}-coin`
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
          <stop offset="0%" stopColor="var(--color-purple-400)" />
          <stop offset="100%" stopColor="var(--color-purple-200)" />
        </linearGradient>
        <linearGradient id={coinGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-yellow-300)" />
          <stop offset="100%" stopColor="var(--color-yellow-400)" />
        </linearGradient>
        <radialGradient id={highlightGradientId}>
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
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
            floodOpacity="0.22"
          />
        </filter>
      </defs>

      <g filter={`url(#${shadowFilterId})`}>
        {/* Legs */}
        <rect x="55" y="122" width="12" height="16" rx="4" fill="var(--color-purple-300)" />
        <rect x="133" y="122" width="12" height="16" rx="4" fill="var(--color-purple-300)" />

        {/* Body */}
        <ellipse
          cx="100"
          cy="90"
          rx="65"
          ry="46"
          fill={`url(#${bodyGradientId})`}
        />

        {/* Snout */}
        <ellipse cx="158" cy="92" rx="16" ry="13" fill="var(--color-purple-300)" />
        <circle cx="153" cy="92" r="2.5" fill="var(--color-purple-500)" />
        <circle cx="163" cy="92" r="2.5" fill="var(--color-purple-500)" />

        {/* Ear */}
        <path d="M55 48 L70 30 L78 55 Z" fill="var(--color-purple-300)" />

        {/* Eye */}
        <circle cx="118" cy="78" r="4" fill="var(--color-purple-900)" />

        {/* Coin slot */}
        <rect x="88" y="46" width="26" height="6" rx="3" fill="var(--color-purple-500)" />

        {/* Tail */}
        <path
          d="M35 78 C24 74, 24 62, 33 60"
          stroke="var(--color-purple-300)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Highlight */}
        <ellipse
          cx="78"
          cy="68"
          rx="26"
          ry="16"
          fill={`url(#${highlightGradientId})`}
        />
      </g>

      {/* Floating accent coins */}
      <g filter={`url(#${shadowFilterId})`}>
        <circle cx="168" cy="34" r="10" fill={`url(#${coinGradientId})`} />
        <circle cx="26" cy="112" r="7" fill="var(--color-green-400)" />
      </g>
    </svg>
  )
}

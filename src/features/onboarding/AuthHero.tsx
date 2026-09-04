import type { ReactElement } from 'react'
import { Logo } from '@/components/Logo'
import { OnboardingIllustration } from './OnboardingIllustration'

// Shared header for every screen in the sign-up/log-in/join flow (the app
// isn't reachable yet, so there's no household name or nav to anchor a
// header on -- this is the one place the "remeeesa" wordmark actually
// belongs, as a real hero moment rather than a bare heading). Reuses the
// same gradient card treatment as the Home budget hero
// (RemainingBudgetDisplay.tsx) so the auth flow doesn't read as a
// leftover, unstyled screen next to the rest of the app.
export function AuthHero(): ReactElement {
  return (
    <div className="from-primary to-[var(--surface-action-gradient-end)] flex w-full flex-col items-center gap-3 rounded-3xl bg-gradient-to-br p-8">
      <OnboardingIllustration className="h-24 w-32" />
      <Logo
        variant="light"
        className="h-7 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
      />
    </div>
  )
}

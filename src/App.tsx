import type { ReactElement } from 'react'
import { HouseholdDraftProvider, OnboardingForm } from '@/features/onboarding'

export function App(): ReactElement {
  return (
    <HouseholdDraftProvider>
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-8 px-6">
        <h1 className="font-display text-2xl tracking-tight">remeeesa</h1>
        <OnboardingForm />
      </main>
    </HouseholdDraftProvider>
  )
}

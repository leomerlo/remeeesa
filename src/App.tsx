import type { ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { JoinHouseholdPage } from '@/features/join'
import { HouseholdDraftProvider, OnboardingForm } from '@/features/onboarding'
import type { SignupAuth } from '@/features/onboarding'
import type { HouseholdsDb } from '@/lib/households'

export type AppProps = {
  readonly currentUserId?: string | null
  readonly signupAuth?: SignupAuth
  readonly householdsDb?: HouseholdsDb
}

export function AppRoutes({
  currentUserId,
  signupAuth,
  householdsDb,
}: AppProps): ReactElement {
  return (
    <HouseholdDraftProvider>
      <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col items-center justify-center gap-8 px-6">
        <h1 className="font-display text-2xl tracking-tight">remeeesa</h1>
        <Routes>
          <Route
            path="/"
            element={
              <OnboardingForm
                householdsDb={householdsDb}
                signupAuth={signupAuth}
              />
            }
          />
          <Route
            path="/join/:token"
            element={
              <JoinHouseholdPage
                currentUserId={currentUserId}
                signupAuth={signupAuth}
                householdsDb={householdsDb}
              />
            }
          />
        </Routes>
      </main>
    </HouseholdDraftProvider>
  )
}

export function App(props: AppProps): ReactElement {
  return (
    <BrowserRouter>
      <AppRoutes {...props} />
    </BrowserRouter>
  )
}

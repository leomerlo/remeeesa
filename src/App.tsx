import type { ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/features/home'
import { EditHouseholdPage } from '@/features/household'
import { JoinHouseholdPage } from '@/features/join'
import { AppShell } from '@/features/navigation'
import { HistoricoPage } from '@/features/historico'
import { CategoriasPage } from '@/features/categorias'
import { HouseholdDraftProvider } from '@/features/onboarding'
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
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-8 px-6 sm:max-w-lg sm:px-8">
        <h1 className="font-display text-2xl tracking-tight">remeeesa</h1>
        <Routes>
          <Route
            element={
              <AppShell
                currentUserId={currentUserId}
                householdsDb={householdsDb}
              />
            }
          >
            <Route
              path="/"
              element={
                <HomePage
                  currentUserId={currentUserId}
                  householdsDb={householdsDb}
                  signupAuth={signupAuth}
                />
              }
            />
            <Route path="/historico" element={<HistoricoPage />} />
            <Route path="/categorias" element={<CategoriasPage />} />
            <Route
              path="/household"
              element={
                <EditHouseholdPage
                  currentUserId={currentUserId}
                  householdsDb={householdsDb}
                />
              }
            />
          </Route>
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

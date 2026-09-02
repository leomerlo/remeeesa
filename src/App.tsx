import type { ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/features/home'
import { EditHouseholdPage } from '@/features/household'
import { JoinHouseholdPage } from '@/features/join'
import { AppShell } from '@/features/navigation'
import { HistoricoPage } from '@/features/historico'
import { CategoriasPage } from '@/features/categorias'
import { CuentasPage } from '@/features/cuentas'
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
      {/* justify-start (Tailwind's flex default), not justify-center: every
          screen -- including short ones like the Histórico/Categorías
          placeholders -- reads as content starting from the top, not
          vertically centered with a dead gap above it. Tall screens (Home,
          the auth flow) already overflow past one viewport, where centering
          would have had no visible effect anyway. */}
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center gap-8 px-6 pt-12 sm:max-w-lg sm:px-8">
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
            <Route
              path="/historico"
              element={
                <HistoricoPage
                  currentUserId={currentUserId}
                  householdsDb={householdsDb}
                />
              }
            />
            <Route path="/categorias" element={<CategoriasPage />} />
            <Route
              path="/cuentas"
              element={
                <CuentasPage
                  currentUserId={currentUserId}
                  householdsDb={householdsDb}
                />
              }
            />
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

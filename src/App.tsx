import type { ReactElement } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/features/home'
import { EditHouseholdPage } from '@/features/household'
import { JoinHouseholdPage } from '@/features/join'
import { AppHeader, AppShell } from '@/features/navigation'
import { HistoricoPage } from '@/features/historico'
import { CategoriasPage } from '@/features/categorias'
import { PendientesPage } from '@/features/pendientes'
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
      <AppHeader currentUserId={currentUserId} householdsDb={householdsDb} />
      {/* justify-start (Tailwind's flex default), not justify-center: every
          screen -- including short ones like the Histórico/Categorías
          placeholders -- reads as content starting from the top, not
          vertically centered with a dead gap above it. Tall screens (Home,
          the auth flow) already overflow past one viewport, where centering
          would have had no visible effect anyway. */}
      {/* Up to `lg` this is the app's single column. From `lg` it hands the
          whole canvas over -- no max-width, no padding of its own -- because
          the desktop layout is a fixed sidebar plus a reading column beside
          it, and only the subtree that knows whether the sidebar is showing
          can place that column. Each route below therefore owns its own
          container from `lg` up: AppShell for everything inside the app,
          and the join route for itself. */}
      <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center gap-8 px-6 pt-6 sm:max-w-lg sm:px-8 lg:max-w-none lg:px-0 lg:pt-0">
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
            <Route
              path="/categorias"
              element={
                <CategoriasPage
                  currentUserId={currentUserId}
                  householdsDb={householdsDb}
                />
              }
            />
            <Route
              path="/pendientes"
              element={
                <PendientesPage
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
              // Reached from an invite link by someone who may not have an
              // account yet -- a sign-up-shaped screen, so it keeps a narrow
              // column on a wide window rather than taking the app layout.
              <div className="flex w-full flex-col items-center gap-8 lg:mx-auto lg:max-w-lg lg:px-8 lg:pt-6">
                <JoinHouseholdPage
                  currentUserId={currentUserId}
                  signupAuth={signupAuth}
                  householdsDb={householdsDb}
                />
              </div>
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

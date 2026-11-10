import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ReactElement } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { createFirebaseClient, readFirebaseEnv } from '@/lib/firebase'
import { FirebaseProvider } from '@/lib/firebaseContext'
import { MonthProvider } from './MonthContext'
import { useAutoDebits } from './useAutoDebits'
import { useBetaSession, useHouseholdName } from './data'
import { Shell } from './Shell'
import { BootSkeleton } from './Skeleton'
import { SignIn } from './SignIn'
import { Onboarding } from './Onboarding'
import { ScrollToTop } from './ScrollToTop'
import { Unirse } from './Unirse'
import { heldInvite, holdInvite } from './invite'
import { Categorias } from './screens/Categorias'
import { Servicios } from './screens/Servicios'
import { Gastos } from './screens/Gastos'
import { Home } from './screens/Home'
import { Perfil } from './screens/Perfil'
import { Tarjetas } from './screens/Tarjetas'
import { Proyecciones } from './screens/Proyecciones'

// Hash routing, not paths: beta.html is a second static entry, and a path
// like /beta/gastos would 404 on Vercel without a rewrite rule nobody will
// remember to add. The hash keeps the back button working with no server
// involved.
// Exported so the beta's demo page can mount the same tree over the
// seeded in-memory household. It reads the session like any screen does,
// so the demo goes through the real sign-in check and the real read-only
// guard rather than around them.
export function BetaRoutes(): ReactElement {
  const session = useBetaSession()
  // The bank's own payments, recorded once the dates they were taken on
  // have passed. Mounted here so it runs on any screen and only once.
  useAutoDebits(session)
  const home = useHouseholdName(session)
  // An invite code travels through the sign-in -- there is nobody to join
  // as until the account exists -- and may also have arrived in the address,
  // from the link the inviter sent, in which case the entry point has
  // already put it away (see invite.ts). Held in sessionStorage so it
  // survives the reload that creating an account can cause.
  const [code, setCode] = useState<string | null>(() => heldInvite())

  const keep = (token: string): void => {
    holdInvite(token)
    setCode(token)
  }
  const forget = (): void => {
    holdInvite(null)
    setCode(null)
  }

  if (session.userId === undefined) {
    return <BootSkeleton />
  }
  if (session.userId === null) {
    return (
      <div className="shell auth-shell">
        <main className="app">
          <SignIn onCode={keep} />
        </main>
      </div>
    )
  }
  if (session.householdId === undefined) {
    return <BootSkeleton />
  }
  // Signed in with no house: either they were invited to one, or this is
  // the first two minutes of a brand-new one.
  if (session.householdId === null) {
    return (
      <div className="shell auth-shell">
        <main className="app">
          {code === null ? (
            <Onboarding session={session} />
          ) : (
            <Unirse session={session} token={code} onForget={forget} />
          )}
        </main>
      </div>
    )
  }

  return (
    <MonthProvider>
      <ScrollToTop />
      <Shell home={home} session={session}>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/gastos" element={<Gastos session={session} />} />
          <Route
            path="/categorias"
            element={<Categorias session={session} />}
          />
          <Route path="/servicios" element={<Servicios session={session} />} />
          <Route path="/tarjetas" element={<Tarjetas session={session} />} />
          <Route path="/perfil" element={<Perfil session={session} />} />
          <Route
            path="/proyeccion"
            element={<Proyecciones session={session} />}
          />
        </Routes>
      </Shell>
    </MonthProvider>
  )
}

export function BetaApp(): ReactElement {
  const client = useMemo(
    () =>
      createFirebaseClient(readFirebaseEnv(import.meta.env), {
        // The same line index.html's entry has, and for the same reason:
        // the end-to-end suite points the app at the local emulators
        // through a build-time variable. The literal `'1'` comparison is
        // what keeps it out of production -- Vite inlines the value, so a
        // bundle built without it carries `useEmulators: false` and the
        // emulator branch is dropped entirely. Without it the beta could
        // only ever be driven against the real project, which is why it
        // had no end-to-end coverage.
        useEmulators: import.meta.env.VITE_FIREBASE_EMULATORS === '1',
      }),
    [],
  )
  const queryClient = useMemo(() => new QueryClient(), [])

  return (
    <FirebaseProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <BetaRoutes />
        </HashRouter>
      </QueryClientProvider>
    </FirebaseProvider>
  )
}

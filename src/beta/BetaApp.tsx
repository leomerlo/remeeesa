import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { createFirebaseClient, readFirebaseEnv } from '@/lib/firebase'
import { FirebaseProvider, useFirebase } from '@/lib/firebaseContext'
import { MonthProvider } from './MonthContext'
import { useBetaSession } from './data'
import { Shell } from './Shell'
import { BootSkeleton } from './Skeleton'
import { SignIn } from './SignIn'
import { Cuentas } from './screens/Cuentas'
import { Gastos } from './screens/Gastos'
import { Home } from './screens/Home'
import { Perfil } from './screens/Perfil'
import { Proyecciones } from './screens/Proyecciones'

// Hash routing, not paths: beta.html is a second static entry, and a path
// like /beta/gastos would 404 on Vercel without a rewrite rule nobody will
// remember to add. The hash keeps the back button working with no server
// involved.
function Routed(): ReactElement {
  const firebase = useFirebase()
  const session = useBetaSession()

  async function signIn(): Promise<void> {
    await signInWithPopup(firebase.auth, new GoogleAuthProvider())
  }

  if (session.userId === undefined) {
    return <BootSkeleton />
  }
  if (session.userId === null) {
    return (
      <div className="shell auth-shell">
        <main className="app">
          <SignIn
            onGoogle={() => {
              void signIn()
            }}
          />
        </main>
      </div>
    )
  }

  return (
    <MonthProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Home session={session} />} />
          <Route path="/gastos" element={<Gastos session={session} />} />
          <Route path="/cuentas" element={<Cuentas session={session} />} />
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
    () => createFirebaseClient(readFirebaseEnv(import.meta.env)),
    [],
  )
  const queryClient = useMemo(() => new QueryClient(), [])

  return (
    <FirebaseProvider client={client}>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <Routed />
        </HashRouter>
      </QueryClientProvider>
    </FirebaseProvider>
  )
}

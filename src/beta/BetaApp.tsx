import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useMemo } from 'react'
import type { ReactElement } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { createFirebaseClient, readFirebaseEnv } from '@/lib/firebase'
import { FirebaseProvider, useFirebase } from '@/lib/firebaseContext'
import { useBetaSession } from './data'
import { Shell } from './Shell'
import { SignIn } from './SignIn'
import { Home } from './screens/Home'
import { Pending } from './screens/placeholders'

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
    return <div className="shell" aria-busy="true" />
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
    <Shell>
      <Routes>
        <Route path="/" element={<Home session={session} />} />
        <Route path="/gastos" element={<Pending title="Gastos" />} />
        <Route path="/cuentas" element={<Pending title="Cuentas" />} />
        <Route path="/perfil" element={<Pending title="Mi perfil" />} />
      </Routes>
    </Shell>
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { FirebaseProvider } from '@/lib/firebaseContext'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import {
  DEMO_USER_ID,
  scenarioFromSearch,
  seedDemoHousehold,
} from '@/demo/seed'
import { BetaDbProvider } from '../data'
import { BetaRoutes } from '../BetaApp'
import '../theme.css'

// The beta's own demo page -- the same thing demo.html is for the v1, and
// dev-only for the same reason: Vite builds one HTML file at a time, and
// neither `npm run build` (index.html) nor `npm run build:beta` (beta.html)
// ever names this one, so nothing under here reaches a user.
// src/demo/productionIsolation.test.ts holds that.
//
// It exists because the beta reads a real household and nothing else: with
// no way in but Flor's own password, there was no way to look at a screen
// at all. On the seeded household every screen can be seen, and every
// figure on it can be checked against a total somebody worked out by hand.
//
//   npm run dev  →  http://localhost:5183/beta-demo.html
//                   http://localhost:5183/beta-demo.html?seed=completa
//                   http://localhost:5183/beta-demo.html?seed=muchas

const scenario = scenarioFromSearch(window.location.search)
const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Missing #root element in beta-demo.html')
}

void seedDemoHousehold({ db, scenario }).then(() => {
  createRoot(rootElement).render(
    <FirebaseProvider
      client={createFirebaseStub({
        auth: {
          currentUser: { uid: DEMO_USER_ID },
          authStateReady: () => Promise.resolve(),
          onAuthStateChanged: () => () => {},
        },
      })}
    >
      <QueryClientProvider client={new QueryClient()}>
        {/* Wrapped in the read-only guard on the way in, exactly like the
            live one -- a demo that could write would be the easiest place
            for a write to slip past unnoticed. */}
        <BetaDbProvider db={db}>
          <HashRouter>
            <BetaRoutes />
          </HashRouter>
        </BetaDbProvider>
      </QueryClientProvider>
    </FirebaseProvider>,
  )
})

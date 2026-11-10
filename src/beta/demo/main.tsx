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

// The app's demo page -- the same thing demo.html is for the old one, and
// dev-only for the same reason: `npm run build` names index.html and
// v1.html and nothing else, so nothing under here reaches a user.
// src/demo/productionIsolation.test.ts holds that.
//
// It exists so a screen can be looked at without opening the real
// household: on the seeded one every screen can be seen, every figure can
// be checked against a total somebody worked out by hand, and anything can
// be added, edited and deleted without it mattering -- the whole thing is
// thrown away on reload.
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
        <BetaDbProvider db={db}>
          <HashRouter>
            <BetaRoutes />
          </HashRouter>
        </BetaDbProvider>
      </QueryClientProvider>
    </FirebaseProvider>,
  )
})

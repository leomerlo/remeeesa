import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { AppProviders } from '@/app/AppProviders'
import { AppRoutes } from '@/App'
import { createQueryClient } from '@/lib/queryClient'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { DemoBanner } from './DemoBanner'
import { DEMO_USER_ID, scenarioFromSearch, seedDemoHousehold } from './seed'
import '@/index.css'

// A dev-only entry point. It is NOT part of the production build: Vite
// builds index.html alone (see vite.config.ts -- no extra rollup inputs), so
// demo.html and everything under src/demo never reach dist/, and neither
// does the in-memory database it borrows from src/test. Production keeps
// talking to Firebase exactly as before.
//
// What it is for: showing the app as a brand-new household sees it. That is
// the one state the real app can never be put back into once it has been
// used for a day, and it is where onboarding lives.
//
//   npm run dev  →  http://localhost:5183/demo.html
//                   http://localhost:5183/demo.html?seed=completa

const scenario = scenarioFromSearch(window.location.search)
const db = createMemoryHouseholdsDb().asUser(DEMO_USER_ID)

// The onboarding checklist remembers on this device that it is finished.
// A demo of a brand-new account that opens with the checklist already gone
// is no demo at all, so the flag is cleared on every load.
try {
  localStorage.removeItem('remeeesa.onboarding_finished')
} catch {
  // A browser with storage blocked has nothing to clear.
}

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Missing #root element in demo.html')
}

void seedDemoHousehold({ db, scenario }).then(() => {
  createRoot(rootElement).render(
    <AppProviders
      client={createFirebaseStub({
        auth: {
          currentUser: { uid: DEMO_USER_ID },
          authStateReady: () => Promise.resolve(),
          onAuthStateChanged: () => () => {},
        },
      })}
      queryClient={createQueryClient()}
    >
      <DemoBanner scenario={scenario} />
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes currentUserId={DEMO_USER_ID} householdsDb={db} />
      </MemoryRouter>
    </AppProviders>,
  )
})

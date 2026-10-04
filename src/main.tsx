import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/AppProviders'
import { createQueryClient } from './lib/queryClient'
import { createFirebaseClient, readFirebaseEnv } from './lib/firebase'
import { App } from './App'
import './index.css'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element in index.html')
}

// The literal `'1'` comparison is what keeps this out of production: Vite
// inlines the env var at build time, so a bundle built without it has
// `useEmulators: false` and the emulator branch is dropped entirely.
const client = createFirebaseClient(readFirebaseEnv(import.meta.env), {
  useEmulators: import.meta.env.VITE_FIREBASE_EMULATORS === '1',
})
const queryClient = createQueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders client={client} queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>,
)

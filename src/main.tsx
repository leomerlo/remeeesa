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

const client = createFirebaseClient(readFirebaseEnv(import.meta.env))
const queryClient = createQueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders client={client} queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>,
)

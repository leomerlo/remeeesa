import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProviders } from './app/AppProviders'
import { createQueryClient } from './lib/queryClient'
import { createSupabaseClient, readSupabaseEnv } from './lib/supabase'
import './index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element in index.html')
}

const client = createSupabaseClient(readSupabaseEnv(import.meta.env))
const queryClient = createQueryClient()

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders client={client} queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>,
)

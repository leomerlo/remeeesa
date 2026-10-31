import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { readFirebaseEnv } from '@/lib/firebase'
import { BetaShell } from './BetaShell'

// The beta's own entry point. Vite builds one HTML file at a time, so this
// tree and index.html's never meet: `npm run build` produces v1 and nothing
// under src/beta/ enters it, and `npm run build:beta` produces this one.
// src/beta/entryIsolation.test.ts holds both halves of that.
const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element in beta.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <BetaShell firebaseProjectId={readFirebaseEnv(import.meta.env).projectId} />
  </StrictMode>,
)

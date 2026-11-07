import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BetaApp } from './BetaApp'
import { claimInviteFromAddress } from './invite'
import './theme.css'

// The beta's own entry point. Vite builds one HTML file at a time, so this
// tree and index.html's never meet: `npm run build` produces v1 and nothing
// under src/beta/ enters it, and `npm run build:beta` produces this one.
// src/beta/entryIsolation.test.ts holds both halves of that.
// Before anything renders: an invite link opened in a browser carries the
// code in its hash, and it is put away and taken out of the address here so
// no component has to do it from an effect.
claimInviteFromAddress(window.location)

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element in beta.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <BetaApp />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BetaApp } from './BetaApp'
import { claimInviteFromAddress } from './invite'
import './theme.css'

// The app's entry point: index.html loads this one, and v1.html loads the
// old tree, which is still built as the way back (ADR 0008). The two
// never meet -- nothing under src/beta/ imports the old app's features,
// components or screens, which is what src/beta/entryIsolation.test.ts
// holds.
// Before anything renders: an invite link opened in a browser carries the
// code in its hash, and it is put away and taken out of the address here so
// no component has to do it from an effect.
claimInviteFromAddress(window.location)

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Missing #root element in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <BetaApp />
  </StrictMode>,
)

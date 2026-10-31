import type { ReactElement } from 'react'

// Scaffolding, on purpose.
//
// The beta's interface is designed from zero (see docs/beta-design.md), and
// none of it is written yet. What this screen is for is proving the pipeline
// end to end before any design lands on it: that the second entry builds,
// that its own Vercel project serves it at its own URL, and that the
// Firebase config reaches it. Everything below gets deleted the moment the
// first real screen exists.
//
// Deliberately not mounting v1's <App />: booting the old interface here
// would make this "v1 at another URL", and the thing most likely to happen
// to scaffolding is that it stays.
export function BetaShell({
  firebaseProjectId,
}: {
  readonly firebaseProjectId: string
}): ReactElement {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
        background: '#0b0b0c',
        color: '#f4f4f5',
      }}
    >
      <div style={{ maxWidth: '32rem', display: 'grid', gap: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', letterSpacing: '0.1em' }}>
          REMEEESA · BETA
        </p>
        <h1 style={{ margin: 0, fontSize: '2rem', lineHeight: 1.1 }}>
          Acá no hay nada todavía.
        </h1>
        <p style={{ margin: 0, fontSize: '1.125rem', lineHeight: 1.5 }}>
          Esta dirección ya existe y publica sola. Lo que se ve es un andamio:
          sirve para comprobar que la segunda entrada compila, que Vercel la
          sirve en su propia URL y que la configuración de Firebase llega.
        </p>
        <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.6 }}>
          Firebase: {firebaseProjectId}
        </p>
      </div>
    </main>
  )
}

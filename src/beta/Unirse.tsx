import { House, LogIn } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { AlreadyInHouseholdError } from '@/lib/households'
import { authorDisplayNameFromAuth } from '@/lib/displayName'
import { useFirebase } from '@/lib/firebaseContext'
import { Problem } from './fields'
import type { BetaSession } from './data'

// Signed in, no household of their own, and a code in hand. One press: the
// name of the house cannot be shown first, because until the membership
// exists there is no permission to read it.
export function Unirse({
  session,
  token,
  onForget,
}: {
  readonly session: BetaSession
  readonly token: string
  // Drops the code: called when it has been spent, and when "mejor armo mi
  // propia casa" sends them to the onboarding instead -- which is the only
  // other thing a person with no household can do.
  readonly onForget: () => void
}): ReactElement {
  const firebase = useFirebase()
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  const join = (): void => {
    const userId = session.userId
    if (typeof userId !== 'string') return
    setWorking(true)
    setFailed(null)
    void (async () => {
      try {
        const member = await session.db.joinHousehold({
          userId,
          token,
          displayName: authorDisplayNameFromAuth(firebase.auth.currentUser),
        })
        session.adopt(member.householdId)
        onForget()
      } catch (error: unknown) {
        setWorking(false)
        setFailed(
          error instanceof AlreadyInHouseholdError
            ? 'Ya estás en un hogar. Salí de ese primero.'
            : 'Ese código no sirve. Pedí que te lo manden de nuevo.',
        )
      }
    })()
  }

  return (
    <>
      <header className="head">
        <div className="hello">
          Te invitaron a un hogar
          <span>Entrás a anotar con quien te pasó el código.</span>
        </div>
      </header>
      <div className="card step-card">
        <span className="tile" aria-hidden="true">
          <House />
        </span>
        <h3>¿Entrás a ese hogar?</h3>
        <p>
          Vas a ver los gastos que ya tiene cargados, y lo que anotes lo van a
          ver los demás.
        </p>
        {failed === null ? null : <Problem>{failed}</Problem>}
        <button
          className="btn btn-primary"
          type="button"
          disabled={working}
          onClick={join}
        >
          <LogIn />
          {working ? 'Entrando…' : 'Unirme al hogar'}
        </button>
        <button
          className="skip"
          type="button"
          disabled={working}
          onClick={onForget}
        >
          Mejor armo mi propia casa
        </button>
      </div>
    </>
  )
}

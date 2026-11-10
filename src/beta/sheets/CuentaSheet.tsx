import { DoorOpen } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { leaveHousehold, updateMemberDisplayName } from '@/lib/households'
import { useFirebase } from '@/lib/firebaseContext'
import { Sheet, SheetFoot } from '../Sheet'
import { TextField } from '../fields'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'

// Your own account: the name the other people in the house see beside
// everything you load, and the door out.
//
// The name is the only thing here that is really yours -- the mail belongs
// to the sign-in and is not editable from inside the app -- and it matters
// more than it looks: it is what the rows say when two people are loading
// into the same month.
export function CuentaSheet({
  open,
  onClose,
  session,
  householdName,
  alone,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly householdName: string
  // The last member standing. Leaving then is not "leaving": nobody is left
  // to hold the house, and everything in it becomes unreachable.
  readonly alone: boolean
}): ReactElement | null {
  const firebase = useFirebase()
  const [name, setName] = useState(session.displayName ?? '')
  const [leaving, setLeaving] = useState(false)
  const save = useSave(onClose)
  const householdId = session.householdId ?? ''
  const userId = session.userId ?? ''
  const named = name.trim() !== ''

  const leave = (): void => {
    save.run(async () => {
      await leaveHousehold({ db: session.db, userId })
      // Signed in with no household lands on the onboarding, which is not
      // where somebody who just left wants to be. Out altogether, and the
      // way back in is the invite code.
      await firebase.auth.signOut()
    })
  }

  return (
    <Sheet
      title="Tu cuenta"
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Guardar"
          saving={save.saving}
          blocked={!named}
          locked={
            householdId === '' || userId === ''
              ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
              : null
          }
          failed={save.failed}
          onSave={() => {
            save.run(async () => {
              const member = await updateMemberDisplayName({
                db: session.db,
                householdId,
                userId,
                displayName: name.trim(),
              })
              session.rename(member.displayName)
              return member
            })
          }}
        />
      }
    >
      <TextField
        label="Tu nombre"
        value={name}
        onChange={setName}
        placeholder="Flor"
        hint={
          alone
            ? `Es lo que va a ver quien entre a ${householdName} al lado de cada cosa que anotes.`
            : `Es lo que ve el resto de ${householdName} al lado de cada cosa que anotás.`
        }
      />
      <div className="field">
        <span className="flabel">Correo</span>
        <p className="codebox">
          {firebase.auth.currentUser?.email ?? 'Sin correo'}
        </p>
      </div>
      {!named ? (
        <p className="fproblem" role="alert">
          Tu nombre no puede quedar vacío.
        </p>
      ) : null}

      {alone ? (
        <p className="fnote">
          Sos la única persona en {householdName}, así que no hay de dónde
          salir: si te fueras, nadie podría volver a entrar.
        </p>
      ) : leaving ? (
        <>
          <p className="fnote">
            Vas a dejar de ver los gastos de {householdName} y se va a cerrar tu
            sesión. Lo que anotaste queda; para volver, alguien te tiene que
            pasar el código de invitación de nuevo.
          </p>
          <button
            className="btn btn-danger btn-block"
            type="button"
            disabled={save.saving}
            onClick={leave}
          >
            <DoorOpen />
            {save.saving ? 'Saliendo…' : `Salir de ${householdName}`}
          </button>
          <button
            className="skip"
            type="button"
            onClick={() => setLeaving(false)}
          >
            Mejor no
          </button>
        </>
      ) : (
        <button
          className="btn btn-secondary btn-block"
          type="button"
          disabled={save.saving}
          onClick={() => setLeaving(true)}
        >
          <DoorOpen />
          Salir del hogar
        </button>
      )}
    </Sheet>
  )
}

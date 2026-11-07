import { Copy, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import type { Household, HouseholdMember } from '@/lib/households'
import { Sheet, SheetFoot } from '../Sheet'
import { TextField } from '../fields'
import { monthName } from '../format'

// The household's name and who is in it.
//
// The one form in the app that cannot be saved, and the reason is not a
// missing wire: there is only one household and it is the real one. Renaming
// it would be writing over something that was already there, which is the
// line the beta does not cross -- and unlike a gasto there is no second
// household to invent and practise on. So the form is here, filled in and
// honest about why its button is shut.
const HOUSEHOLD_IS_REAL =
  'Este es el hogar de verdad, no uno de prueba. La beta no le cambia el ' +
  'nombre ni toca a los integrantes: eso se hace desde la versión 1.'
export function HogarSheet({
  open,
  onClose,
  household,
  members,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly household: Household
  readonly members: readonly HouseholdMember[]
}): ReactElement {
  const [name, setName] = useState(household.name)
  const named = name.trim() !== ''

  return (
    <Sheet
      title="El hogar"
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Guardar"
          saving={false}
          blocked={!named}
          locked={HOUSEHOLD_IS_REAL}
          failed={null}
          onSave={() => undefined}
        />
      }
    >
      <TextField
        label="Nombre del hogar"
        value={name}
        onChange={setName}
        placeholder="Casa Merlo"
        hint="Es el nombre que aparece arriba en cada pantalla."
      />
      <div className="field">
        <span className="flabel">Quiénes están ({members.length})</span>
        <div className="mlist">
          {members.map((member) => (
            <div className="mrow" key={member.userId}>
              <span className="tile" aria-hidden="true">
                <UserRound />
              </span>
              <span className="k">{member.displayName}</span>
              <span className="v">
                {`Desde el ${String(member.joinedAt.getDate())} de ${monthName(member.joinedAt)}`}
              </span>
            </div>
          ))}
        </div>
      </div>
      {canSaveNote(named)}
    </Sheet>
  )
}

function canSaveNote(named: boolean): ReactElement | null {
  return named ? null : (
    <p className="fproblem" role="alert">
      El hogar necesita un nombre.
    </p>
  )
}

// Inviting someone, which in the v1 is a code the other person types or a
// link that carries it for them.
//
// The code is read from the household, never made here: creating one writes
// a document onto the real household and there is no undoing it from here,
// so it stays on the far side of the line. A household that has never
// invited anybody has no code yet, and this says so rather than showing a
// blank.
const INVITE_IS_A_WRITE =
  'Crear el código escribe en el hogar que ya existe, así que la beta no ' +
  'lo hace. Generalo una vez desde la versión 1 y acá vas a poder copiarlo.'
export function InvitarSheet({
  open,
  onClose,
  code,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly code: string | null
}): ReactElement {
  const [copied, setCopied] = useState(false)
  const link =
    code === null ? null : `${window.location.origin}/beta.html#/entrar/${code}`

  return (
    <Sheet
      title="Invitar a alguien"
      open={open}
      onClose={onClose}
      footer={
        code === null ? (
          <SheetFoot
            label="Crear el código"
            saving={false}
            blocked={false}
            locked={INVITE_IS_A_WRITE}
            failed={null}
            onSave={() => undefined}
          />
        ) : (
          <button
            className="btn btn-primary btn-block"
            type="button"
            onClick={() => {
              if (link === null) return
              void navigator.clipboard
                .writeText(link)
                .then(() => {
                  setCopied(true)
                })
                .catch(() => {
                  // A browser that refuses the clipboard is not an error
                  // worth a message: the link is on screen to be copied by
                  // hand.
                  setCopied(false)
                })
            }}
          >
            <Copy />
            {copied ? 'Copiado' : 'Copiar el link'}
          </button>
        )
      }
    >
      <p className="fnote">
        Quien entre con esto va a ver los mismos gastos, servicios y tarjetas
        que ustedes, y va a poder anotar.
      </p>
      {code === null ? (
        <p className="fproblem" role="alert">
          Este hogar todavía no tiene código de invitación.
        </p>
      ) : (
        <>
          <div className="field">
            <span className="flabel">El código</span>
            <p className="codebox">{code}</p>
          </div>
          <div className="field">
            <span className="flabel">El link</span>
            <p className="linkbox">{link}</p>
          </div>
        </>
      )}
    </Sheet>
  )
}

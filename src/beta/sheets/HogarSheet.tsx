import { Copy, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { renameHousehold } from '@/lib/households'
import type { Household, HouseholdMember } from '@/lib/households'
import { Sheet, SheetFoot } from '../Sheet'
import { TextField } from '../fields'
import { monthName } from '../format'
import { inviteLink } from '../invite'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'

// The household's name and who is in it.
export function HogarSheet({
  open,
  onClose,
  session,
  household,
  members,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly household: Household
  readonly members: readonly HouseholdMember[]
}): ReactElement {
  const [name, setName] = useState(household.name)
  const named = name.trim() !== ''
  const { saving, failed, run } = useSave(onClose)

  return (
    <Sheet
      title="El hogar"
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Guardar"
          saving={saving}
          blocked={!named}
          locked={null}
          failed={failed}
          onSave={() => {
            run(() =>
              renameHousehold({
                db: session.db,
                householdId: household.id,
                name: name.trim(),
              }),
            )
          }}
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

// Inviting someone: a code the other person types, or a link that carries
// it for them.
//
// This is the one write onto the real household that Flor allowed out loud
// ("te habilito la regla para generar link de invitación"), and it is the
// mildest one there is: asking twice gives the same code back, so a
// household that already has one is not changed at all. It still waits for
// a press rather than firing on open -- opening a sheet should not write
// anything.
export function InvitarSheet({
  open,
  onClose,
  session,
  householdId,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly householdId: string
}): ReactElement {
  const [code, setCode] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const link =
    code === null
      ? null
      : inviteLink({
          origin: window.location.origin,
          token: code,
        })

  const fetchCode = (): void => {
    setWorking(true)
    setFailed(null)
    void session.db
      .getOrCreateInvite({ householdId })
      .then((invite) => {
        setCode(invite.token)
      })
      .catch(() => {
        setFailed('No se pudo conseguir el código. Probá de nuevo.')
      })
      .finally(() => {
        setWorking(false)
      })
  }

  return (
    <Sheet
      title="Invitar a alguien"
      open={open}
      onClose={onClose}
      footer={
        code === null ? (
          <SheetFoot
            label={working ? 'Buscando…' : 'Conseguir el código'}
            saving={working}
            blocked={false}
            locked={null}
            failed={failed}
            onSave={fetchCode}
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
      {code === null ? null : (
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

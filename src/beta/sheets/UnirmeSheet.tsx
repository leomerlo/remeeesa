import { useState } from 'react'
import type { ReactElement } from 'react'
import { Info } from 'lucide-react'
import { Sheet, SheetFoot } from '../Sheet'
import { TextField } from '../fields'
import { tokenFromPaste } from '../invite'

// What somebody who was invited pastes in. Whatever they were sent works:
// the code on its own, or the whole link -- a person who gets a link does
// not know which part of it is the code, and should not have to.
export function UnirmeSheet({
  open,
  onClose,
  onKeep,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly onKeep: (token: string) => void
}): ReactElement | null {
  const [paste, setPaste] = useState('')
  const token = tokenFromPaste(paste)

  return (
    <Sheet
      title="Unirme a un hogar"
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Unirme"
          saving={false}
          blocked={token === ''}
          locked={null}
          failed={null}
          onSave={() => onKeep(token)}
        />
      }
    >
      <TextField
        label="Pegá el código o el link que te pasaron"
        value={paste}
        onChange={setPaste}
        placeholder="remeeesa.app/unirme/…"
      />
      <div className="card alert alert-info">
        <span className="tile" aria-hidden="true">
          <Info />
        </span>
        <p>
          Al entrar vas a ver los gastos de ese hogar, y lo que anotes lo van a
          ver los demás.
        </p>
      </div>
    </Sheet>
  )
}

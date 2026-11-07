import { useState } from 'react'
import type { ReactElement } from 'react'
import { Sheet, SheetFoot } from '../Sheet'
import { MoneyField, Toggle, moneyIsValid, moneyValue, pesos } from '../fields'
import { monthName } from '../format'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'

// One line of next month's guess.
//
// The whole projection is two kinds of edit and no more: a line that will
// not happen this time ("este mes no pagamos el gimnasio"), and a line that
// will not cost what it costs ("las expensas vienen 120, no 88"). Both are
// asked here, over one row, rather than by putting a switch and a number
// field into every row of the list -- which is the v1's shape, and is a lot
// of very small controls on a phone.
//
// What it writes is the household's, not this browser's: one document per
// month per household, the same one the v1 reads and writes, so a scenario
// typed here is the scenario Leo opens.
export type ProjectionRow = {
  readonly key: string
  readonly label: string
  // What the figures suggest, before anybody argues with it.
  readonly price: number
}

export function ProyeccionSheet({
  open,
  onClose,
  session,
  row,
  monthStart,
  excluded,
  overrides,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly row: ProjectionRow
  readonly monthStart: Date
  // The month's edits as they stand, keyed the way the v1 keys them.
  readonly excluded: ReadonlySet<string>
  readonly overrides: Readonly<Record<string, string>>
}): ReactElement | null {
  const key = `${String(monthStart.getTime())}-${row.key}`
  const [counts, setCounts] = useState(!excluded.has(key))
  const [amount, setAmount] = useState(
    () => overrides[key] ?? String(row.price),
  )
  const save = useSave(onClose)
  const householdId = session.householdId ?? ''
  const priced = moneyIsValid(amount, { required: false })
  const changed = moneyValue(amount) !== row.price

  const onSave = (): void => {
    const nextExcluded = new Set(excluded)
    if (counts) nextExcluded.delete(key)
    else nextExcluded.add(key)
    const nextOverrides: Record<string, string> = { ...overrides }
    // An amount typed back to what was suggested is not an override any
    // more: leaving it behind would pin this line to a figure that the next
    // month's reading is meant to move.
    if (changed && priced) nextOverrides[key] = String(moneyValue(amount))
    else delete nextOverrides[key]

    save.run(() =>
      session.db.saveProjection({
        householdId,
        monthStart,
        excluded: [...nextExcluded],
        overrides: nextOverrides,
      }),
    )
  }

  return (
    <Sheet
      title={row.label}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Guardar"
          saving={save.saving}
          blocked={!priced}
          locked={
            householdId === ''
              ? 'Todavía estamos leyendo el hogar. Probá de nuevo en un segundo.'
              : null
          }
          failed={save.failed}
          onSave={onSave}
        />
      }
    >
      <Toggle
        k={`Cuenta en ${monthName(monthStart)}`}
        v="Apagalo si este mes no va a pasar. La línea queda a la vista, pero sin sumar."
        checked={counts}
        onChange={setCounts}
      />
      <MoneyField
        label="Cuánto va a ser"
        value={amount}
        onChange={setAmount}
        hint={
          changed
            ? `Lo que dice la cuenta es ${pesos(row.price)}. Lo tuyo manda.`
            : 'Sale de lo que llevan de este mes y de lo que gastaron el mes pasado. Si sabés que va a venir distinto, cambialo.'
        }
      />
      {priced ? null : (
        <p className="fproblem" role="alert">
          El monto tiene que ser un número.
        </p>
      )}
    </Sheet>
  )
}

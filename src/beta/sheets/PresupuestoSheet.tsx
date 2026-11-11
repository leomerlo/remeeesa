import { useState } from 'react'
import type { ReactElement } from 'react'
import { updateHouseholdBudget } from '@/lib/households'
import type { Household } from '@/lib/households'
import { monthlyBudgetFor } from '@/lib/households'
import { DangerAction, Sheet, SheetFoot } from '../Sheet'
import { MoneyField, moneyIsValid, moneyValue } from '../fields'
import { monthName } from '../format'
import { useSave } from '../useSave'
import type { BetaSession } from '../data'

// What a month may cost. It belongs to the month on screen and not to the
// household in general -- a budget set in November does not rewrite what
// October was allowed to spend -- which is why this opens from the Inicio
// of that month and not from Perfil.
export function PresupuestoSheet({
  open,
  onClose,
  session,
  household,
  monthStart,
}: {
  readonly open: boolean
  readonly onClose: () => void
  readonly session: BetaSession
  readonly household: Household
  readonly monthStart: Date
}): ReactElement | null {
  const current = monthlyBudgetFor(household, monthStart)
  const [amount, setAmount] = useState(current > 0 ? String(current) : '')
  const { saving, failed, run } = useSave(onClose)

  return (
    <Sheet
      title={current > 0 ? 'Cambiar el presupuesto' : 'Poner un presupuesto'}
      open={open}
      onClose={onClose}
      footer={
        <SheetFoot
          label="Guardar"
          saving={saving}
          blocked={!moneyIsValid(amount, { required: false })}
          locked={null}
          failed={failed}
          onSave={() => {
            run(() =>
              updateHouseholdBudget({
                db: session.db,
                householdId: household.id,
                monthlyBudget: moneyValue(amount),
                month: monthStart,
              }),
            )
          }}
        />
      }
    >
      <MoneyField
        label={`Presupuesto de ${monthName(monthStart)}`}
        value={amount}
        onChange={setAmount}
        hint="Vale para este mes y para los que vengan, hasta que lo cambien."
      />
      {/* Taking it off was always possible -- the field accepts nothing
          and nothing means no ceiling -- but it was said in a line of
          help under the box, which is not where anybody looks for a way
          out. It is an action now. Nothing is lost by it: the month's
          gastos are untouched, the screen just stops measuring them
          against a figure. */}
      {current > 0 ? (
        <>
          <p className="fnote">
            Sin presupuesto no se pierde nada de lo anotado: la pantalla deja
            de comparar contra un tope y pasa a decir cuánto llevan gastado.
          </p>
          <DangerAction
            label="Quitar el presupuesto"
            saving={saving}
            locked={null}
            onPress={() => {
              run(() =>
                updateHouseholdBudget({
                  db: session.db,
                  householdId: household.id,
                  monthlyBudget: 0,
                  month: monthStart,
                }),
              )
            }}
          />
        </>
      ) : null}
    </Sheet>
  )
}

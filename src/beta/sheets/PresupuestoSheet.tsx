import { useState } from 'react'
import type { ReactElement } from 'react'
import { updateHouseholdBudget } from '@/lib/households'
import type { Household } from '@/lib/households'
import { monthlyBudgetFor } from '@/lib/households'
import { Sheet, SheetFoot } from '../Sheet'
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
        hint="Vale para este mes y para los que vengan, hasta que lo cambien. Dejalo en cero y la pantalla vuelve a decir cuánto llevan gastado."
      />
    </Sheet>
  )
}

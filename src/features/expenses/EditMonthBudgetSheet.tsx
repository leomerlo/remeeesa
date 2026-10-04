import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Wallet } from 'lucide-react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Label } from '@/components/ui/label'
import { Sheet } from '@/components/ui/sheet'
import { formatMonthLabel } from '@/lib/format'
import {
  getHousehold,
  monthlyBudgetFor,
  parseMonthlyBudget,
  updateHouseholdBudget,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from '@/features/household'

export type EditMonthBudgetSheetProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // The month on screen. The budget belongs to a month -- see
  // lib/households/monthlyBudget -- and the whole point of editing it here
  // is that the month is the one you are already looking at.
  readonly monthStart: Date
  // Uncontrolled by default. MonthNavigator controls it so the empty
  // "Presupuesto del mes" card can open this form -- the budget no longer
  // lives on a page a link can point at.
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
}

// Editing the month's budget from the month itself.
//
// It used to live only in Ajustes, behind a dropdown of every month the
// household has ever had -- which meant correcting September required
// knowing that a month with no entry of its own inherits the last one set
// before it, and therefore that October had to be saved first. Here there
// is no month to pick: it is the one on screen. Per direct feedback.
export function EditMonthBudgetSheet({
  db,
  householdId,
  monthStart,
  open: openProp,
  onOpenChange,
}: EditMonthBudgetSheetProps): ReactElement {
  const queryClient = useQueryClient()
  const queryKey = householdQueryKey({ householdId })
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const householdQuery = useQuery({
    queryKey,
    queryFn: () => getHousehold({ db, householdId }),
  })
  const household = householdQuery.data
  const current =
    household === undefined ? 0 : monthlyBudgetFor(household, monthStart)
  const hasBudget = current > 0
  const amount = draft ?? (hasBudget ? String(current) : '')

  const mutation = useMutation({
    mutationFn: (monthlyBudget: number) =>
      updateHouseholdBudget({
        db,
        householdId,
        monthlyBudget,
        month: monthStart,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKey, updated)
      setDraft(null)
      setError(null)
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar el presupuesto.',
      )
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const monthlyBudget = parseMonthlyBudget(Number(amount.trim()))
      setError(null)
      mutation.mutate(monthlyBudget)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar el presupuesto.',
      )
    }
  }

  return (
    <>
      {/* No trigger of its own on a month with no budget yet: the empty
          "Presupuesto del mes" card above is the call to action there, and
          a second button saying the same thing right under it read as two
          different ones. */}
      {hasBudget ? (
        <Button
          type="button"
          variant="outline"
          // Full width on a phone, hugging its label and pinned right on a
          // monitor -- the same shape "Ver más" takes at the foot of a list.
          className="w-full lg:w-auto lg:self-end"
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
        >
          <Wallet aria-hidden="true" />
          Editar presupuesto del mes
        </Button>
      ) : null}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next && !mutation.isPending) {
            setOpen(false)
            setDraft(null)
          }
        }}
        title={
          hasBudget ? 'Editar presupuesto del mes' : 'Poner presupuesto del mes'
        }
      >
        <form onSubmit={onSubmit} className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-title font-semibold">
              Presupuesto de {formatMonthLabel(monthStart)}
            </h2>
            <p className="text-muted-foreground text-sm">
              Cuánto decidieron que puede costar este mes. Los demás quedan con
              el que tenían.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="month-budget">Presupuesto</Label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
              >
                $
              </span>
              <FormattedAmountInput
                id="month-budget"
                name="month-budget"
                className="pl-8"
                value={amount}
                onChange={setDraft}
                disabled={mutation.isPending}
                autoFocus
                autoComplete="off"
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Dejalo vacío si este mes no lleva presupuesto.
            </p>
          </div>
          {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </form>
      </Sheet>
    </>
  )
}

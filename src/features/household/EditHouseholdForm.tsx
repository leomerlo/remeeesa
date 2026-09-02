import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/expenses'
import {
  getHousehold,
  parseHouseholdName,
  parseMonthlyBudget,
  updateHousehold,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from './householdQueryKey'

export type EditHouseholdFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function EditHouseholdForm({
  db,
  householdId,
}: EditHouseholdFormProps): ReactElement {
  const queryClient = useQueryClient()
  const queryKey = householdQueryKey({ householdId })
  const householdQuery = useQuery({
    queryKey,
    queryFn: () => getHousehold({ db, householdId }),
  })
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [budgetDraft, setBudgetDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const household = householdQuery.data
  const name = nameDraft ?? (household !== undefined ? household.name : '')
  const amount =
    budgetDraft ??
    (household !== undefined ? String(household.monthlyBudget) : '')

  const mutation = useMutation({
    mutationFn: (input: {
      readonly name: string
      readonly monthlyBudget: number
    }) =>
      updateHousehold({
        db,
        householdId,
        name: input.name,
        monthlyBudget: input.monthlyBudget,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKey, updated)
      setNameDraft(null)
      setBudgetDraft(null)
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const nextName = parseHouseholdName(name)
      const monthlyBudget = parseMonthlyBudget(Number(amount.trim()))
      setError(null)
      mutation.mutate({ name: nextName, monthlyBudget })
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'No se pudo guardar el hogar'
      setError(message)
    }
  }

  return (
    <form
      className="flex w-full flex-col items-center gap-6"
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="household-name"
          className="text-muted-foreground font-medium"
        >
          Nombre del hogar
        </Label>
        <Input
          id="household-name"
          name="household-name"
          value={name}
          onChange={(event) => {
            setNameDraft(event.target.value)
          }}
          autoComplete="organization"
        />
      </div>

      <div className="flex w-full flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <Label
            htmlFor="monthly-budget"
            className="text-muted-foreground font-medium"
          >
            Presupuesto mensual
          </Label>
          {/* The confirmed, saved amount -- separate from `amount` above,
              which tracks the in-progress draft. Lets a rejected submission
              (e.g. a negative budget) visibly leave the real value unchanged
              instead of just clearing an error message. Always shown: it is
              the only confirmation that a save landed. */}
          {household !== undefined ? (
            <p role="status" className="text-muted-foreground text-xs">
              Actual: {formatCurrency(household.monthlyBudget)}
            </p>
          ) : null}
        </div>
        {/* The peso sign lives beside the field rather than inside its value:
            the raw number stays parseable, but the input stops reading as a
            bare "500000" next to amounts formatted everywhere else. */}
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          >
            $
          </span>
          <Input
            id="monthly-budget"
            name="monthly-budget"
            className="pl-7"
            value={amount}
            onChange={(event) => {
              setBudgetDraft(event.target.value)
            }}
            inputMode="decimal"
            autoComplete="off"
          />
        </div>
      </div>

      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}

      <Button type="submit" className="w-full">
        Guardar
      </Button>
    </form>
  )
}

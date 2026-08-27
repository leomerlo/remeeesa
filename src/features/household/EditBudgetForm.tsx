import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getHousehold,
  parseMonthlyBudget,
  updateHouseholdBudget,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from './householdQueryKey'

export type EditBudgetFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function EditBudgetForm({
  db,
  householdId,
}: EditBudgetFormProps): ReactElement {
  const queryClient = useQueryClient()
  const queryKey = householdQueryKey({ householdId })
  const householdQuery = useQuery({
    queryKey,
    queryFn: () => getHousehold({ db, householdId }),
  })
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const household = householdQuery.data
  const amount =
    draft ?? (household !== undefined ? String(household.monthlyBudget) : '')

  const mutation = useMutation({
    mutationFn: (monthlyBudget: number) =>
      updateHouseholdBudget({ db, householdId, monthlyBudget }),
    onSuccess: async () => {
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey })
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const monthlyBudget = parseMonthlyBudget(Number(amount.trim()))
      setError(null)
      mutation.mutate(monthlyBudget)
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : 'Monthly budget must be a positive number'
      setError(message)
    }
  }

  return (
    <form
      className="flex w-full flex-col items-center gap-8"
      onSubmit={onSubmit}
    >
      {household !== undefined ? (
        <p role="status" className="font-display text-5xl tracking-tight">
          {household.monthlyBudget}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="monthly-budget"
          className="text-muted-foreground font-medium"
        >
          Monthly budget
        </Label>
        <Input
          id="monthly-budget"
          name="monthly-budget"
          value={amount}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
        />
      </div>

      {error !== null ? (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      ) : null}

      <Button type="submit">Save budget</Button>
    </form>
  )
}

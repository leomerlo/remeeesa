import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseHouseholdDraft } from './householdDraft'
import { useHouseholdDraft } from './HouseholdDraftContext'

export function OnboardingForm(): ReactElement {
  const { saveDraft } = useHouseholdDraft()
  const [name, setName] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  const [error, setError] = useState<string | null>(null)

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const parsed = parseHouseholdDraft({ name, monthlyBudget })
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }

    setError(null)
    saveDraft(parsed.draft)
  }

  return (
    <form
      className="flex w-full flex-col items-center gap-8"
      onSubmit={onSubmit}
    >
      <div className="flex w-full flex-col gap-2">
        <Label
          htmlFor="household-name"
          className="text-muted-foreground font-medium"
        >
          Household name
        </Label>
        <Input
          id="household-name"
          name="household-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
          autoComplete="organization"
        />
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <Label
          htmlFor="monthly-budget"
          className="text-muted-foreground font-medium"
        >
          Monthly budget
        </Label>
        <Input
          id="monthly-budget"
          name="monthly-budget"
          value={monthlyBudget}
          onChange={(event) => {
            setMonthlyBudget(event.target.value)
          }}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className="h-auto border-0 px-0 text-center font-display text-5xl tracking-tight md:text-5xl"
        />
        <p className="text-muted-foreground text-sm">
          How much you can spend each month
        </p>
      </div>

      {error !== null ? (
        <p role="alert" className="text-sm font-medium">
          {error}
        </p>
      ) : null}

      <Button type="submit">Continue</Button>
    </form>
  )
}

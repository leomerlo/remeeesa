import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  getHousehold,
  parseHouseholdName,
  renameHousehold,
} from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { householdQueryKey } from './householdQueryKey'

export type HouseholdNameFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// The household's name, on its own.
//
// It used to share a form -- and a single "Guardar" -- with the monthly
// budget, which made one button mean two unrelated things: renaming the
// house and deciding what a month is allowed to cost. Saving the name then
// also wrote a budget for whichever month the picker happened to be on. Per
// direct feedback, the name comes first and comes alone.
export function HouseholdNameForm({
  db,
  householdId,
}: HouseholdNameFormProps): ReactElement {
  const queryClient = useQueryClient()
  const queryKey = householdQueryKey({ householdId })
  const householdQuery = useQuery({
    queryKey,
    queryFn: () => getHousehold({ db, householdId }),
  })
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const household = householdQuery.data
  const name = draft ?? household?.name ?? ''

  const mutation = useMutation({
    mutationFn: (nextName: string) =>
      renameHousehold({ db, householdId, name: nextName }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKey, updated)
      setDraft(null)
      setError(null)
      setSaved(true)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (caught: unknown) => {
      setSaved(false)
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar. Volvé a intentar.',
      )
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      const nextName = parseHouseholdName(name)
      setError(null)
      setSaved(false)
      mutation.mutate(nextName)
    } catch (caught) {
      setSaved(false)
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar el hogar',
      )
    }
  }

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={onSubmit}>
      <div className="flex w-full flex-col gap-2">
        <Label htmlFor="household-name">Nombre del hogar</Label>
        <Input
          id="household-name"
          name="household-name"
          value={name}
          onChange={(event) => {
            setDraft(event.target.value)
            setSaved(false)
          }}
          autoComplete="organization"
        />
      </div>
      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      {saved && error === null ? (
        <p
          aria-live="polite"
          className="bg-success-surface text-success rounded-xl px-4 py-3 text-sm"
        >
          Guardado.
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={mutation.isPending}
        className="w-full lg:w-auto lg:self-end"
      >
        {mutation.isPending ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  )
}

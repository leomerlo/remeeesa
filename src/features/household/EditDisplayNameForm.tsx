import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SheetFooter, SheetScrollArea } from '@/components/ui/sheet'
import { updateMemberDisplayName } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { membersQueryKey } from './membersQueryKey'

export type EditDisplayNameFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly userId: string
  readonly currentDisplayName: string
  // Lets the sheet holding this close itself once the save lands.
  readonly onSaved?: () => void
}

// Self-only: lets a member set/correct their own name -- e.g. a membership
// created before this field existed (like Leo Merlo's own, generic
// "Miembro" until this ships), or a Google display name they'd rather not
// use. Invalidates membersQueryKey on save so MemberList picks up the
// change immediately, without a page reload.
export function EditDisplayNameForm({
  db,
  householdId,
  userId,
  currentDisplayName,
  onSaved,
}: EditDisplayNameFormProps): ReactElement {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState(currentDisplayName)
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (name: string) =>
      updateMemberDisplayName({ db, householdId, userId, displayName: name }),
    onSuccess: async () => {
      onSaved?.()
      setError(null)
      await queryClient.invalidateQueries({
        queryKey: membersQueryKey({ householdId }),
      })
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar tu nombre',
      )
    },
  })

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    mutation.mutate(displayName)
  }

  return (
    <form className="flex h-full min-h-0 w-full flex-col" onSubmit={onSubmit}>
      {/* One field, but the same two bands as every other sheet: the action
          belongs at the bottom of the sheet, not beside the input. It used
          to sit next to the field, where it was the one control in the app
          that moved when the field did. Per direct feedback. */}
      <SheetScrollArea className="gap-2">
        <Label htmlFor="member-display-name">Tu nombre</Label>
        <Input
          id="member-display-name"
          name="member-display-name"
          value={displayName}
          disabled={mutation.isPending}
          onChange={(event) => {
            setDisplayName(event.target.value)
          }}
          autoComplete="name"
        />
        {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      </SheetScrollArea>

      <SheetFooter>
        <Button type="submit" disabled={mutation.isPending} className="w-full">
          Guardar nombre
        </Button>
      </SheetFooter>
    </form>
  )
}

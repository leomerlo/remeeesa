import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoriesQueryKey } from '@/features/expenses'
import { findOrCreateCategory, parseCategoryName } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'

export type AddCategoryFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onAdded: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

// Name only -- findOrCreateCategory assigns a color by hashing the name, the
// same as every category a member types fresh into an expense/pendiente
// form already gets. Picking a specific color is still one tap away
// afterward, via this same category's own "Editar" row -- not worth a
// second control here for what's the uncommon case.
export function AddCategoryForm({
  db,
  householdId,
  onAdded,
  onPendingChange,
}: AddCategoryFormProps): ReactElement {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (parsedName: string) =>
      findOrCreateCategory({ db, householdId, name: parsedName }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey({ householdId }),
      })
      setName('')
      onAdded()
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo agregar la categoría. Volvé a intentar.',
      )
    },
  })

  useEffect(() => {
    onPendingChange?.(mutation.isPending)
  }, [mutation.isPending, onPendingChange])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    let parsedName: string
    try {
      parsedName = parseCategoryName(name)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Nombre inválido')
      return
    }
    mutation.mutate(parsedName)
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      {/* Only this part scrolls -- the submit button below stays pinned at
          the bottom of the sheet regardless of field-list height. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-category-name">Nombre</Label>
          <Input
            id="new-category-name"
            value={name}
            disabled={mutation.isPending}
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
        </div>

        {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      </div>

      <div className="shrink-0 pt-6">
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          Agregar categoría
        </Button>
      </div>
    </form>
  )
}

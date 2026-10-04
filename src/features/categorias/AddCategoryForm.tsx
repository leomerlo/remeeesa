import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoriesQueryKey } from '@/features/expenses'
import {
  findOrCreateCategory,
  parseCategoryName,
  updateCategoryBudget,
  updateCategoryColor,
} from '@/lib/expenses'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { CategoryColorPicker } from './CategoryColorPicker'
import { CATEGORY_COLOR_PALETTE } from '@/lib/expenses/categoryColor'
import type { HouseholdsDb } from '@/lib/households'

export type AddCategoryFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly onAdded: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

// The same three fields the edit form has, in the same order. It used to
// ask for a name and nothing else, which meant adding a category and then
// editing it were two different-looking screens for the same thing -- and
// the colour, which is the whole point of a category being distinguishable,
// could only be chosen after the fact. Per direct feedback.
//
// The colour still starts at the one the household has free (see
// nextCategoryColor); the picker only matters when somebody wants a
// specific one.
export function AddCategoryForm({
  db,
  householdId,
  onAdded,
  onPendingChange,
}: AddCategoryFormProps): ReactElement {
  const [name, setName] = useState('')
  const [monthlyBudget, setMonthlyBudget] = useState('')
  // Null until the category exists and the app has picked a free colour for
  // it: until then there is nothing for the picker to show as selected.
  const [color, setColor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (parsedName: string) => {
      const created = await findOrCreateCategory({
        db,
        householdId,
        name: parsedName,
      })
      // Applied after the fact rather than passed in: creating a category
      // is one call that already decides a colour, and the two fields here
      // are both "leave it alone unless it was touched".
      if (color !== null && color !== created.color) {
        await updateCategoryColor({
          db,
          householdId,
          categoryId: created.id,
          color,
        })
      }
      const budget =
        monthlyBudget.trim() === '' ? 0 : Number(monthlyBudget.trim())
      if (budget !== created.monthlyBudget) {
        await updateCategoryBudget({
          db,
          householdId,
          categoryId: created.id,
          monthlyBudget: budget,
        })
      }
      return created
    },
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey({ householdId }),
      })
      setName('')
      setMonthlyBudget('')
      setColor(null)
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
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-x-hidden overflow-y-auto overscroll-contain">
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

        <div className="flex flex-col gap-2">
          <Label htmlFor="new-category-budget">Presupuesto del mes</Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
            >
              $
            </span>
            <FormattedAmountInput
              id="new-category-budget"
              name="new-category-budget"
              className="pl-8"
              value={monthlyBudget}
              onChange={setMonthlyBudget}
              disabled={mutation.isPending}
              autoComplete="off"
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Cuánto querés gastar en esta categoría por mes. Dejalo vacío si no
            querés ponerle tope.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">Color</span>
          <CategoryColorPicker
            value={color ?? (CATEGORY_COLOR_PALETTE[0] as string)}
            onChange={setColor}
            disabled={mutation.isPending}
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

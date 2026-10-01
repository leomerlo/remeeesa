import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertMessage } from '@/components/ui/alert-message'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { FormattedAmountInput } from '@/components/ui/formatted-amount-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoriesQueryKey, expensesQueryKey } from '@/features/expenses'
import {
  deleteCategory,
  mergeCategories,
  parseCategoryName,
  renameCategory,
  updateCategoryBudget,
  updateCategoryColor,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import { pendientesQueryKey } from '@/features/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { CategoryColorPicker } from './CategoryColorPicker'

export type EditCategoryFormProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly category: Category
  readonly otherCategories: readonly Category[]
  readonly onDone: () => void
  readonly onPendingChange?: (pending: boolean) => void
}

type Action = 'save' | 'merge' | 'delete'

export function EditCategoryForm({
  db,
  householdId,
  category,
  otherCategories,
  onDone,
  onPendingChange,
}: EditCategoryFormProps): ReactElement {
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState(category.color)
  // Blank rather than "0" for a category with no ceiling: an empty optional
  // field should look empty, not like a zero someone typed.
  const [monthlyBudget, setMonthlyBudget] = useState(
    category.monthlyBudget > 0 ? String(category.monthlyBudget) : '',
  )
  const [survivorId, setSurvivorId] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Renaming or merging moves category ids on Expenses and Pendientes, so every
  // screen that reads either has to refetch -- not just the category list.
  async function invalidateAll(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: categoriesQueryKey({ householdId }),
      }),
      queryClient.invalidateQueries({
        queryKey: expensesQueryKey({ householdId }),
      }),
      queryClient.invalidateQueries({
        queryKey: pendientesQueryKey({ householdId }),
      }),
    ])
  }

  // FormattedAmountInput hands back a plain Number()-parseable string, and
  // blank means "no ceiling" -- Number('') is 0, which is exactly that.
  function parseAmountInput(raw: string): number {
    const trimmed = raw.trim()
    return trimmed === '' ? 0 : Number(trimmed)
  }

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action === 'delete') {
        await deleteCategory({ db, householdId, categoryId: category.id })
        return
      }
      if (action === 'merge') {
        await mergeCategories({
          db,
          householdId,
          sourceCategoryId: category.id,
          survivorCategoryId: survivorId,
        })
        return
      }
      // Color and ceiling first: if the rename then fails on a collision,
      // what the user set is already saved rather than silently discarded.
      if (color !== category.color) {
        await updateCategoryColor({
          db,
          householdId,
          categoryId: category.id,
          color,
        })
      }
      const nextBudget = parseAmountInput(monthlyBudget)
      if (nextBudget !== category.monthlyBudget) {
        await updateCategoryBudget({
          db,
          householdId,
          categoryId: category.id,
          monthlyBudget: nextBudget,
        })
      }
      // Last: a rename moves the document, so everything above has to have
      // landed on the old one first.
      if (parseCategoryName(name) !== category.name) {
        await renameCategory({ db, householdId, categoryId: category.id, name })
      }
    },
    onMutate: () => {
      setError(null)
      onPendingChange?.(true)
    },
    onSettled: () => {
      onPendingChange?.(false)
    },
    onSuccess: async () => {
      await invalidateAll()
      onDone()
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar la categoría. Volvé a intentar.',
      )
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    try {
      parseCategoryName(name)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Nombre inválido')
      return
    }
    mutation.mutate('save')
  }

  const pending = mutation.isPending

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Nombre</Label>
        <Input
          id="category-name"
          value={name}
          disabled={pending}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </div>

      {/* Optional, and blank for almost every category: a ceiling is for
          the few the household wants to move carefully inside -- café,
          delivery, super. Blank (or 0) means no ceiling at all. The ceilings
          are not required to add up to the monthly budget; going over it is
          a warning on the Categorías screen, not a refusal here. Per direct
          feedback. */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-budget">Presupuesto del mes</Label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          >
            $
          </span>
          <FormattedAmountInput
            id="category-budget"
            name="category-budget"
            className="pl-8"
            value={monthlyBudget}
            onChange={setMonthlyBudget}
            disabled={pending}
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
          value={color}
          onChange={setColor}
          disabled={pending}
        />
      </div>

      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        Guardar
      </Button>

      {otherCategories.length > 0 ? (
        <div className="border-border flex flex-col gap-2 border-t pt-6">
          <Label htmlFor="merge-target">Unir con otra categoría</Label>
          {/* Merge is the escape hatch from both a name collision and a
              category that cannot be deleted, so it sits next to Guardar
              rather than behind a separate screen. */}
          <select
            id="merge-target"
            value={survivorId}
            disabled={pending}
            onChange={(event) => {
              setSurvivorId(event.target.value)
            }}
            className="border-border bg-background h-12 rounded-lg border px-3 text-sm"
          >
            <option value="">Elegí una categoría</option>
            {otherCategories.map((other) => (
              <option key={other.id} value={other.id}>
                {other.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Los gastos y pendientes de «{category.name}» pasan a la categoría
            que elijas, y «{category.name}» se borra.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending || survivorId === ''}
            onClick={() => {
              mutation.mutate('merge')
            }}
          >
            Unir
          </Button>
        </div>
      ) : null}

      <div className="border-border flex flex-col gap-2 border-t pt-6">
        {confirmingDelete ? (
          <>
            <p className="text-sm font-medium">
              ¿Seguro que querés borrar «{category.name}»?
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={pending}
              onClick={() => {
                mutation.mutate('delete')
              }}
            >
              Sí, borrar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
              onClick={() => {
                setConfirmingDelete(false)
              }}
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => {
              setConfirmingDelete(true)
            }}
          >
            Borrar categoría
          </Button>
        )}
      </div>
    </form>
  )
}

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoriesQueryKey, expensesQueryKey } from '@/features/expenses'
import {
  deleteCategory,
  mergeCategories,
  parseCategoryName,
  renameCategory,
  updateCategoryColor,
} from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import { cuentasQueryKey } from '@/features/cuentas'
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
  const [survivorId, setSurvivorId] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  // Renaming or merging moves category ids on Expenses and Cuentas, so every
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
        queryKey: cuentasQueryKey({ householdId }),
      }),
    ])
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
      // Color first: if the rename then fails on a collision, the color the
      // user picked is already saved rather than silently discarded.
      if (color !== category.color) {
        await updateCategoryColor({
          db,
          householdId,
          categoryId: category.id,
          color,
        })
      }
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

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium">Color</span>
        <CategoryColorPicker
          value={color}
          onChange={setColor}
          disabled={pending}
        />
      </div>

      {error !== null ? (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      ) : null}

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
            Los gastos y cuentas de «{category.name}» pasan a la categoría que
            elijas, y «{category.name}» se borra.
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
              variant="ghost"
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

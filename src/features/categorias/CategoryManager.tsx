import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { cssVars } from '@/lib/cssVars'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { categoriesQueryKey } from '@/features/expenses'
import { listCategories } from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { AddCategoryForm } from './AddCategoryForm'
import { EditCategoryForm } from './EditCategoryForm'

export type CategoryManagerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// Lists every category the household has, not only the ones with spend this
// month: an unused category is exactly the one somebody wants to rename or
// delete, and the breakdown above never shows it.
export function CategoryManager({
  db,
  householdId,
}: CategoryManagerProps): ReactElement {
  const [editing, setEditing] = useState<Category | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isAddSubmitting, setIsAddSubmitting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  const categories = categoriesQuery.data
  const sorted =
    categories === undefined
      ? undefined
      : [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <section
      aria-labelledby="tus-categorias-heading"
      className="bg-card flex w-full flex-col gap-4 rounded-3xl p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="tus-categorias-heading" className="text-title font-semibold">
          Tus categorías
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            setIsAdding(true)
          }}
        >
          <Plus aria-hidden="true" />
          Agregar
        </Button>
      </div>
      {sorted === undefined ? (
        <div
          role="status"
          aria-label="Cargando…"
          className="flex flex-col gap-1"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex w-full items-center gap-3 p-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : (
        <ul aria-label="Todas las categorías" className="flex flex-col gap-1">
          {sorted.map((category) => (
            <li key={category.id}>
              {/* Labelled rather than left to compose its own name: the row
                  already prints the category name, so an added sr-only
                  "Editar X" would read out as "X Editar X". */}
              <button
                type="button"
                aria-label={`Editar ${category.name}`}
                className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-2xl p-2 text-left outline-none focus-visible:ring-3"
                onClick={() => {
                  setEditing(category)
                }}
              >
                <span
                  aria-hidden="true"
                  data-testid="manager-swatch"
                  className="size-6 shrink-0 rounded-full bg-[var(--swatch-color)]"
                  style={cssVars({ '--swatch-color': category.color })}
                />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {category.name}
                </span>
                <Pencil
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onOpenChange={(next) => {
          // A save already in flight has to resolve inside the still-mounted
          // form; unmounting it mid-write would swallow the outcome, including
          // the collision error the user needs to see.
          if (!next && !isSubmitting) {
            setEditing(null)
          }
        }}
        title="Editar categoría"
      >
        {editing === null ? (
          <span />
        ) : (
          <EditCategoryForm
            db={db}
            householdId={householdId}
            category={editing}
            otherCategories={(sorted ?? []).filter(
              (other) => other.id !== editing.id,
            )}
            onPendingChange={setIsSubmitting}
            onDone={() => {
              setEditing(null)
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={isAdding}
        onOpenChange={(next) => {
          if (!next && !isAddSubmitting) {
            setIsAdding(false)
          }
        }}
        title="Agregar categoría"
      >
        <AddCategoryForm
          db={db}
          householdId={householdId}
          onPendingChange={setIsAddSubmitting}
          onAdded={() => {
            setIsAdding(false)
          }}
        />
      </Sheet>
    </section>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  categoriesQueryKey,
  expensesInMonthQueryKey,
  expensesQueryKey,
} from '@/features/expenses'
import {
  deleteCategory,
  formatCurrency,
  listCategories,
  listExpensesInMonth,
  summarizeByCategory,
} from '@/lib/expenses'
import { listPendientes, pendientesDueInMonth } from '@/lib/pendientes'
import { pendientesQueryKey } from '@/features/pendientes'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import type { Category } from '@/lib/expenses'
import type { HouseholdsDb } from '@/lib/households'
import { ConfirmDestructive } from '@/components/ui/confirm-destructive'
import { MovementCard } from '@/components/MovementCard'
import { AddCategoryForm } from './AddCategoryForm'
import { EditCategoryForm } from './EditCategoryForm'

export type CategoryManagerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  // The month whose spend each card reports. Passed down from the page so
  // every section of Categorías moves together when the pager does.
  readonly monthStart: Date
  readonly monthEnd: Date
}

// Lists every category the household has, not only the ones with spend this
// month: an unused category is exactly the one somebody wants to rename or
// delete, and the breakdown above never shows it.
export function CategoryManager({
  db,
  householdId,
  monthStart,
  monthEnd,
}: CategoryManagerProps): ReactElement {
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const [isAdding, setIsAdding] = useState(false)
  const [isAddSubmitting, setIsAddSubmitting] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const categoriesQuery = useQuery({
    queryKey: categoriesQueryKey({ householdId }),
    queryFn: () => listCategories({ db, householdId }),
  })

  // Deleting moves nothing: whatever the category held is left without one,
  // so every screen that reads an expense or a bill has to refetch.
  const deleteMutation = useMutation({
    mutationFn: (categoryId: string) =>
      deleteCategory({ db, householdId, categoryId }),
    onMutate: () => {
      setDeleteError(null)
    },
    // A category with gastos or servicios in it cannot be deleted, and
    // saying so is the whole point: without this the confirmation simply
    // sat there and the button did nothing at all.
    onError: (caught: unknown) => {
      setDeleting(null)
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo borrar la categoría.',
      )
    },
    onSuccess: async () => {
      setDeleting(null)
      setDeleteError(null)
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
    },
  })

  // The same keys and shapes the breakdown above already populates, so this
  // reads the month out of Tanstack's cache rather than fetching it twice.
  const expensesQuery = useQuery({
    queryKey: [
      ...expensesInMonthQueryKey({ householdId }),
      monthStart.getTime(),
    ],
    queryFn: () =>
      listExpensesInMonth({ db, householdId, monthStart, monthEnd }),
  })
  const pendingQuery = useQuery({
    queryKey: [...pendientesQueryKey({ householdId }), 'committed'],
    queryFn: () => listPendientes({ db, householdId }),
  })
  // What each category has taken this month, counted the same way "Por
  // categoría" counts it -- this month's expenses plus the bills still owed
  // in it -- so the figure on a card and the figure in the breakdown above
  // it are never two different numbers for the same thing.
  const spentByCategory = new Map(
    expensesQuery.data === undefined ||
      categoriesQuery.data === undefined ||
      pendingQuery.data === undefined
      ? []
      : summarizeByCategory({
          expenses: expensesQuery.data,
          categories: categoriesQuery.data,
          pendientes: pendientesDueInMonth(
            pendingQuery.data,
            monthStart,
            monthEnd,
          ),
        }).map((entry) => [entry.categoryId, entry.total] as const),
  )

  const categories = categoriesQuery.data
  const sorted =
    categories === undefined
      ? undefined
      : [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <section
      aria-labelledby="tus-categorias-heading"
      className="flex w-full flex-col gap-3"
    >
      {/* Title and the one action outside, a card per category inside --
          the same shape the two sections above it have. Per direct
          feedback. */}
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
      {deleteError === null ? null : <AlertMessage>{deleteError}</AlertMessage>}
      {sorted === undefined ? (
        <div
          role="status"
          aria-label="Cargando…"
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-card card-surface flex flex-col gap-2 rounded-2xl p-4"
            >
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        // A household with no categories at all: every other list in the
        // app says what belongs in it when it is empty, and this one used
        // to show a bare heading with a button beside it and nothing
        // underneath. Per direct feedback: every empty state names its own
        // way forward.
        <EmptyState
          illustration={ILLUSTRATIONS.tidy}
          title="Todavía no hay categorías"
          description="Son los grupos en los que cae cada gasto: comida, casa, transporte. Creá la primera y vas a poder elegirla al cargar."
          action={
            <Button
              type="button"
              onClick={() => {
                setIsAdding(true)
              }}
            >
              <Plus aria-hidden="true" />
              Agregar categoría
            </Button>
          }
        />
      ) : (
        // One per row on a phone, two on a monitor. These carry the same
        // card as every movement and bill, which is a wide shape -- at four
        // across the name, the figure and the footer were all fighting for
        // about 200px. Per direct feedback.
        <ul
          aria-label="Todas las categorías"
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          {sorted.map((category) => (
            <li key={category.id}>
              {/* The same card every movement and every bill uses: the
                  category's own disc, its name, what it has taken this
                  month, and a footer with the two things you can do to it.
                  No category badge -- it would only repeat the title. Per
                  direct feedback. */}
              <MovementCard
                categoryName={category.name}
                categoryColor={category.color}
                CategoryIcon={iconForCategoryName(category.name)}
                title={category.name}
                showCategoryBadge={false}
                amount={
                  spentByCategory.get(category.id) === undefined ||
                  spentByCategory.get(category.id) === 0 ? (
                    // A category with nothing on it this month says so
                    // rather than showing a bare "$0", which reads like a
                    // figure that failed to load.
                    <span className="text-muted-foreground shrink-0 text-sm">
                      Sin gastos
                    </span>
                  ) : (
                    <span className="money text-foreground shrink-0 text-lg">
                      {formatCurrency(spentByCategory.get(category.id) ?? 0)}
                    </span>
                  )
                }
                when={
                  category.monthlyBudget > 0 ? (
                    <>
                      Tope{' '}
                      <span className="text-foreground font-bold">
                        {formatCurrency(category.monthlyBudget)}
                      </span>
                    </>
                  ) : (
                    'Sin tope'
                  )
                }
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Editar ${category.name}`}
                      onClick={() => {
                        setEditing(category)
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-outline"
                      size="sm"
                      aria-label={`Borrar ${category.name}`}
                      onClick={() => {
                        setDeleting(category)
                      }}
                    >
                      <Trash2 aria-hidden="true" />
                      Borrar
                    </Button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDestructive
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !deleteMutation.isPending) {
            setDeleting(null)
          }
        }}
        title={`Borrar «${deleting?.name ?? ''}»`}
        description={
          <>
            Los gastos y servicios que tenga quedan sin categoría. Si lo que
            querés es juntarla con otra, usá «Unir con otra categoría» desde
            Editar.
          </>
        }
        confirmLabel="Sí, borrar"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting !== null) {
            deleteMutation.mutate(deleting.id)
          }
        }}
      />

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

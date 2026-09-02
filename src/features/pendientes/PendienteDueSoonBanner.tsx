import { useQuery } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { listCategories } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { iconForCategoryName } from '@/lib/expenses/categoryIcon'
import { formatShortDate } from '@/lib/format'
import { listPendientes, pendientesDueSoon } from '@/lib/pendientes'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type PendienteDueSoonBannerProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// Home's first content under the page title, above the month navigator and
// everything else -- there's no push notification in this app, so this is
// the only place a Pendiente's approaching due date surfaces on its own,
// without the user going to look for it. Purely informational: no tap
// action, nothing to dismiss, no unread state to track.
//
// Renders nothing at all (not an empty card, not a skeleton) whenever
// nothing is due soon, which is most of the time -- a skeleton that almost
// always resolves to "nothing here" would just flash at the very top of
// Home on every load.
//
// Shares PorPagarSection's exact queryKey/queryFn shape ({ pendientes,
// categories }) so both read from the same cache entry instead of issuing a
// duplicate fetch -- see RecentExpensesList's comment on why the shape has
// to match exactly.
export function PendienteDueSoonBanner({
  db,
  householdId,
}: PendienteDueSoonBannerProps): ReactElement | null {
  const pendientesQuery = useQuery({
    queryKey: pendientesQueryKey({ householdId }),
    queryFn: async () => {
      const [pendientes, categories] = await Promise.all([
        listPendientes({ db, householdId }),
        listCategories({ db, householdId }),
      ])
      return { pendientes, categories }
    },
  })

  if (pendientesQuery.isPending || pendientesQuery.isError) {
    return null
  }

  const { pendientes, categories } = pendientesQuery.data
  const dueSoon = pendientesDueSoon(pendientes, new Date())
  if (dueSoon.length === 0) {
    return null
  }

  const categoryById = new Map(
    categories.map((category) => [category.id, category]),
  )

  return (
    <section aria-labelledby="due-soon-heading" className="w-full">
      <h2 id="due-soon-heading" className="text-title font-semibold">
        Vencimientos que se acercan
      </h2>
      {/* Same horizontal-scroll treatment as Cuentas por pagar (see that
          component's comment for why each class is there), tinted amber
          instead of the plain card background so it reads as a heads-up
          rather than just another list. */}
      <ul
        aria-label="Vencimientos próximos"
        className="-mx-6 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-6 px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {dueSoon.map((pendiente) => {
          const category = categoryById.get(pendiente.categoryId)
          const categoryName = category?.name ?? 'Categoría desconocida'
          const categoryColor =
            category?.color ?? colorForCategoryName(categoryName)
          const CategoryIcon = iconForCategoryName(categoryName)

          return (
            <li key={pendiente.id} className="flex shrink-0 snap-start">
              <div className="bg-yellow-100 flex h-full w-40 flex-col gap-1.5 rounded-2xl p-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: categoryColor }}
                >
                  <CategoryIcon
                    className="size-4 text-white"
                    aria-hidden="true"
                  />
                </span>
                <span className="text-foreground mt-auto truncate text-sm font-medium">
                  {pendiente.name}
                </span>
                <span className="text-yellow-800 truncate text-xs font-medium">
                  Vence {formatShortDate(pendiente.dueDate)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

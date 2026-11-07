import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { Lock, Trash2 } from 'lucide-react'
import { CategoryBadge } from '@/components/CategoryBadge'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import {
  ConfirmDestructive,
  useConfirmDestructive,
} from '@/components/ui/confirm-destructive'
import {
  categoriesQueryKey,
  expensesQueryKey,
} from '@/features/expenses/queryKeys'
import { CARD_PURCHASE_LOCKED_MESSAGE, deleteCardPurchase } from '@/lib/cards'
import type { ResumenCuota } from '@/lib/cards'
import { formatAmount } from '@/lib/expenses'
import type { Category } from '@/lib/expenses'
import { colorForCategoryName } from '@/lib/expenses/categoryColor'
import { formatDate } from '@/lib/format'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from './queryKeys'

export type ConsumoRowProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly consumo: ResumenCuota
  readonly categories: readonly Category[]
}

// One consumo inside a card's bill, wherever that bill is shown: the
// estimate for next month, or a Resumen opened from Servicios.
//
// It carries its own "Eliminar" because this is where the household meets
// the thing. A bill is the sum of its consumos and cannot be deleted on its
// own -- what has to go is the purchase underneath. Until now the only way
// to reach it was Histórico, in the month it was bought, which meant
// remembering a date to get rid of something you were looking straight at.
// Per direct feedback: un consumo que ya no pago más y no puedo eliminar.
export function ConsumoRow({
  db,
  householdId,
  consumo,
  categories,
}: ConsumoRowProps): ReactElement {
  const { purchase, cuota } = consumo
  const queryClient = useQueryClient()
  const confirm = useConfirmDestructive()
  const category = categories.find(
    (candidate) => candidate.id === purchase.categoryId,
  )
  const categoryName = category?.name ?? 'Categoría desconocida'
  // Its cuota is inside a Resumen the household already paid, so the money
  // left the house: removing it now would make a settled month add up to
  // something nobody paid.
  const locked = purchase.paidResumenIds.length > 0

  const mutation = useMutation({
    mutationFn: () =>
      deleteCardPurchase({ db, householdId, purchaseId: purchase.id }),
    onSuccess: async () => {
      confirm.close()
      // The bills it was in, the expenses a paid bill generated, and the
      // category totals those feed.
      await queryClient.invalidateQueries({
        queryKey: pendientesQueryKey({ householdId }),
      })
      await queryClient.invalidateQueries({
        queryKey: expensesQueryKey({ householdId }),
      })
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey({ householdId }),
      })
    },
    onError: () => {
      confirm.close()
    },
  })

  return (
    <li className="flex flex-col gap-2">
      <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-2xl p-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-body text-foreground truncate font-medium">
            {purchase.name}
          </span>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <CategoryBadge
              name={categoryName}
              color={category?.color ?? colorForCategoryName(categoryName)}
            />
            <span>{formatDate(purchase.purchaseDate)}</span>
            {purchase.cuotas === 1 ? null : (
              <span>{`cuota ${String(cuota.number)}/${String(purchase.cuotas)}`}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="money text-foreground text-lg">
            {formatAmount(cuota.amount, purchase.currency)}
          </span>
          {locked ? (
            // The lock says why instead of a button that would only be
            // refused. Same mark Histórico puts on the same purchase.
            <Lock
              role="img"
              aria-label={CARD_PURCHASE_LOCKED_MESSAGE}
              className="text-muted-foreground size-4"
            >
              <title>{CARD_PURCHASE_LOCKED_MESSAGE}</title>
            </Lock>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Eliminar ${purchase.name}`}
              disabled={mutation.isPending}
              onClick={confirm.ask}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      {mutation.isError ? (
        <AlertMessage>
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'No se pudo eliminar el consumo'}
        </AlertMessage>
      ) : null}
      <ConfirmDestructive
        open={confirm.open}
        onOpenChange={confirm.onOpenChange}
        title={`¿Eliminar ${purchase.name}?`}
        description={
          purchase.cuotas === 1
            ? 'Se borra el consumo y sale del resumen de la tarjeta.'
            : `Se borran las ${String(purchase.cuotas)} cuotas y salen de todos los resúmenes donde estaban.`
        }
        confirmLabel="Eliminar el consumo"
        pending={mutation.isPending}
        onConfirm={() => {
          mutation.mutate()
        }}
      />
    </li>
  )
}

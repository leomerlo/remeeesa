import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { CreditCard, Pencil, Plus, Trash2 } from 'lucide-react'
import { AlertMessage } from '@/components/ui/alert-message'
import { EmptyState } from '@/components/EmptyState'
import { ILLUSTRATIONS } from '@/components/illustrations'
import { Button } from '@/components/ui/button'
import { ConfirmDestructive } from '@/components/ui/confirm-destructive'
import { MovementCard } from '@/components/MovementCard'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import {
  PAYMENT_METHOD_KINDS,
  createCard,
  deleteCard,
  listCards,
  updateCard,
} from '@/lib/cards'
import type { Card } from '@/lib/cards'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from '@/features/pendientes'
import { CardBrandMark } from './CardBrandMark'
import { CARD_CURRENCY_OPTIONS, CardForm } from './CardForm'
import { cardsQueryKey } from './cardsQueryKey'

export type CardsSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

// The household's credit cards, one card each.
//
// This was a single panel holding a row per card, and each row was a bare
// currency dropdown and a ghost "Renombrar" with the add form loose at the
// bottom -- three different controls in a line with nothing saying they
// belonged to the same thing. Now a card is a card, like a category or a
// movement: its own mark, its name, what it can be billed in said in words,
// and a footer with the two things you can do to it. Everything that
// changes it happens in a sheet. Per direct feedback.
export function CardsSection({
  db,
  householdId,
}: CardsSectionProps): ReactElement {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Card | null>(null)
  const [deleting, setDeleting] = useState<Card | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cardsQuery = useQuery({
    queryKey: cardsQueryKey({ householdId }),
    queryFn: () => listCards({ db, householdId }),
  })

  // Renaming a card renames its Resúmenes, so the bills have to refetch too.
  async function invalidate(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: cardsQueryKey({ householdId }),
      }),
      queryClient.invalidateQueries({
        queryKey: pendientesQueryKey({ householdId }),
      }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: (input: {
      readonly card: Card | undefined
      readonly name: string
      readonly kind: Card['kind']
      readonly currency: Card['currency']
      readonly brand: Card['brand']
    }) =>
      input.card === undefined
        ? createCard({
            db,
            householdId,
            name: input.name,
            kind: input.kind,
            currency: input.currency,
            brand: input.brand,
          })
        : updateCard({
            db,
            householdId,
            cardId: input.card.id,
            name: input.name,
            kind: input.kind,
            currency: input.currency,
            brand: input.brand,
          }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      setEditing(null)
      setIsAdding(false)
      await invalidate()
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar el método de pago.',
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (cardId: string) => deleteCard({ db, householdId, cardId }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      setDeleting(null)
      await invalidate()
    },
    // A card with consumos cannot be deleted, and saying why is the whole
    // point -- the alternative is a button that does nothing.
    onError: (caught: unknown) => {
      setDeleting(null)
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo borrar el método de pago.',
      )
    },
  })

  const cards = cardsQuery.data
  // "Crédito · Pesos y dólares": what it does with the money first, since
  // that is the half that decides how a gasto behaves.
  const methodLabel = (card: Card): string => {
    const kind =
      PAYMENT_METHOD_KINDS.find((option) => option.value === card.kind)
        ?.label ?? 'Crédito'
    const currency =
      CARD_CURRENCY_OPTIONS.find((option) => option.value === card.currency)
        ?.label ?? 'Pesos'
    return `${kind} · ${currency}`
  }

  return (
    <section
      aria-labelledby="metodos-heading"
      className="flex w-full flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-2">
        {/* "Métodos de pago", not "Tarjetas": cash, a Mercado Pago balance
            and a debit card are all ways this household pays for things,
            and only one of them is a card. Per direct feedback. */}
        <h2 id="metodos-heading" className="text-title font-semibold">
          Métodos de pago
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null)
            setIsAdding(true)
          }}
        >
          <Plus aria-hidden="true" />
          Agregar
        </Button>
      </div>

      {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      {/* A load that failed has to say so. Without this the section sat on
          its skeleton for ever, since the query's data simply stays
          undefined -- the same shape as "still loading". */}
      {cardsQuery.isError ? (
        <AlertMessage>
          {cardsQuery.error instanceof Error
            ? cardsQuery.error.message
            : 'No se pudieron cargar los métodos de pago.'}
        </AlertMessage>
      ) : null}

      {cardsQuery.isError ? null : cards === undefined ? (
        <div
          role="status"
          aria-label="Cargando…"
          className="grid grid-cols-1 gap-3 lg:grid-cols-2"
        >
          <span className="sr-only">Cargando…</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        // The shared empty state, not a hand-rolled one: this screen was
        // the last place still drawing its own, with a grey outline icon
        // where every other empty moment in the app has the mascot. Per
        // direct feedback.
        <EmptyState
          illustration={ILLUSTRATIONS.loaded}
          title="Todavía no hay métodos de pago"
          description="Efectivo, débito, una cuenta de Mercado Pago o una tarjeta de crédito: con el que elijas al cargar un gasto, la app sabe si sale este mes o va al resumen del que viene."
          action={
            <Button
              type="button"
              onClick={() => {
                setError(null)
                setIsAdding(true)
              }}
            >
              <Plus aria-hidden="true" />
              Agregar método
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {cards.map((card) => (
            <li key={card.id}>
              <MovementCard
                categoryName={card.name}
                categoryColor="#4e4c56"
                CategoryIcon={CreditCard}
                showCategoryBadge={false}
                iconSlot={
                  <span
                    aria-hidden="true"
                    className="bg-muted text-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
                  >
                    <CardBrandMark brand={card.brand} className="size-7" />
                  </span>
                }
                title={card.name}
                amount={null}
                when={methodLabel(card)}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Editar ${card.name}`}
                      onClick={() => {
                        setError(null)
                        setEditing(card)
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-outline"
                      size="sm"
                      aria-label={`Borrar ${card.name}`}
                      onClick={() => {
                        setError(null)
                        setDeleting(card)
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

      <Sheet
        open={isAdding || editing !== null}
        onOpenChange={(next) => {
          if (!next && !saveMutation.isPending) {
            setIsAdding(false)
            setEditing(null)
            setError(null)
          }
        }}
        title={editing === null ? 'Agregar método' : 'Editar método'}
      >
        <CardForm
          // Remounted per card, so the fields start from whichever one is
          // open rather than from whatever the last one left behind.
          key={editing?.id ?? 'nueva'}
          {...(editing === null ? {} : { card: editing })}
          pending={saveMutation.isPending}
          error={error}
          onSubmit={(input) => {
            saveMutation.mutate({
              card: editing ?? undefined,
              name: input.name,
              kind: input.kind,
              currency: input.currency,
              brand: input.brand,
            })
          }}
        />
      </Sheet>

      <ConfirmDestructive
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !deleteMutation.isPending) {
            setDeleting(null)
          }
        }}
        title={`Borrar «${deleting?.name ?? ''}»`}
        description="Solo se puede borrar un método sin gastos ni resúmenes cargados."
        confirmLabel="Sí, borrar"
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting !== null) {
            deleteMutation.mutate(deleting.id)
          }
        }}
      />
    </section>
  )
}

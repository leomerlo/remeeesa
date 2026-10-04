import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  createCard,
  listCards,
  renameCard,
  updateCardCurrency,
} from '@/lib/cards'
import { DEFAULT_CURRENCY } from '@/lib/money'
import type { Currency } from '@/lib/money'
import type { Card } from '@/lib/cards'
import type { HouseholdsDb } from '@/lib/households'
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'
import { cardsQueryKey } from './cardsQueryKey'

export type CardsSectionProps = {
  readonly db: HouseholdsDb
  readonly householdId: string
}

export function CardsSection({
  db,
  householdId,
}: CardsSectionProps): ReactElement {
  const [name, setName] = useState('')
  // Fixed when the card is created and never edited afterwards: its past
  // Resúmenes are already denominated, so changing it would rewrite what
  // they meant.
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const queryKey = cardsQueryKey({ householdId })

  const cardsQuery = useQuery({
    queryKey,
    queryFn: () => listCards({ db, householdId }),
  })

  const mutation = useMutation({
    mutationFn: (cardName: string) =>
      createCard({ db, householdId, name: cardName, currency }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setName('')
      setCurrency(DEFAULT_CURRENCY)
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar la tarjeta. Volvé a intentar.',
      )
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    mutation.mutate(name)
  }

  const cards = cardsQuery.data

  return (
    <section
      className="flex w-full flex-col gap-3"
      aria-labelledby="cards-heading"
    >
      <h2 id="cards-heading" className="text-title font-semibold">
        Tarjetas
      </h2>
      {cards === undefined ? (
        cardsQuery.isError ? (
          <AlertMessage>
            {cardsQuery.error instanceof Error
              ? cardsQuery.error.message
              : 'No se pudieron cargar las tarjetas.'}
          </AlertMessage>
        ) : (
          <div
            role="status"
            aria-label="Cargando…"
            className="flex flex-col gap-3"
          >
            <span className="sr-only">Cargando…</span>
            <Skeleton className="h-4 w-24" />
          </div>
        )
      ) : cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay tarjetas</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <CardRow
              key={card.id}
              db={db}
              householdId={householdId}
              card={card}
            />
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="new-card-name">Nombre de la tarjeta</Label>
        <div className="flex items-center gap-2">
          <Select
            aria-label="Moneda de la tarjeta"
            value={currency}
            disabled={mutation.isPending}
            onChange={(event) => {
              setCurrency(event.target.value === 'USD' ? 'USD' : 'ARS')
            }}
            className="w-auto shrink-0 text-sm"
          >
            <option value="ARS">$</option>
            <option value="USD">US$</option>
          </Select>
          <Input
            id="new-card-name"
            value={name}
            // readOnly, not disabled: disabling drops keyboard focus to
            // <body>, and this section stays open for the next card.
            readOnly={mutation.isPending}
            onChange={(event) => {
              setName(event.target.value)
            }}
          />
          <Button type="submit" disabled={mutation.isPending}>
            Agregar tarjeta
          </Button>
        </div>
        {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      </form>
    </section>
  )
}

function CardRow({
  db,
  householdId,
  card,
}: CardsSectionProps & { readonly card: Card }): ReactElement {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  // The form unmounts on save or cancel; focus goes back to "Renombrar"
  // instead of dropping to <body>.
  const returnFocus = useRef(false)

  function close(): void {
    returnFocus.current = true
    setDraft(null)
    setError(null)
  }

  // Separate from the rename: changing the currency is a one-tap switch on
  // the row, not something to open a form for.
  const currencyMutation = useMutation({
    mutationFn: (currency: Currency) =>
      updateCardCurrency({ db, householdId, cardId: card.id, currency }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: cardsQueryKey({ householdId }),
      })
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo cambiar la moneda. Volvé a intentar.',
      )
    },
  })

  const mutation = useMutation({
    mutationFn: (name: string) =>
      renameCard({ db, householdId, cardId: card.id, name }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      // Resúmenes carry the card's name, so every Pendiente view refreshes.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: cardsQueryKey({ householdId }),
        }),
        queryClient.invalidateQueries({
          queryKey: pendientesQueryKey({ householdId }),
        }),
      ])
      close()
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo renombrar la tarjeta. Volvé a intentar.',
      )
    },
  })

  if (draft === null) {
    return (
      <li className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {card.name}
          </span>
          {/* Editable, not fixed: every card that existed before currencies
              did reads as pesos, which is right for most of them and wrong
              for the dollar one. Changing it only changes the card -- the
              expenses a paid Resumen already wrote keep the currency
              stamped on them. */}
          <Select
            aria-label={`Moneda de ${card.name}`}
            value={card.currency}
            disabled={currencyMutation.isPending}
            onChange={(event) => {
              currencyMutation.mutate(
                event.target.value === 'USD' ? 'USD' : 'ARS',
              )
            }}
            className="w-auto shrink-0 text-xs"
          >
            <option value="ARS">$</option>
            <option value="USD">US$</option>
          </Select>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Renombrar ${card.name}`}
          ref={(button) => {
            if (button !== null && returnFocus.current) {
              returnFocus.current = false
              button.focus()
            }
          }}
          onClick={() => {
            setDraft(card.name)
          }}
        >
          Renombrar
        </Button>
      </li>
    )
  }

  const inputId = `rename-card-${card.id}`
  return (
    <li>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault()
          // Nothing changed: no batch over every Resumen of the card.
          if (draft.trim() === card.name) {
            close()
            return
          }
          mutation.mutate(draft)
        }}
      >
        <Label htmlFor={inputId}>Nuevo nombre de {card.name}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            value={draft}
            autoFocus
            readOnly={mutation.isPending}
            onChange={(event) => {
              setDraft(event.target.value)
            }}
          />
          <Button
            type="submit"
            disabled={mutation.isPending}
            aria-label={`Guardar nombre de ${card.name}`}
          >
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            aria-label={`Cancelar renombrar ${card.name}`}
            onClick={close}
          >
            Cancelar
          </Button>
        </div>
        {error !== null ? <AlertMessage>{error}</AlertMessage> : null}
      </form>
    </li>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { AlertMessage } from '@/components/ui/alert-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { createCard, listCards } from '@/lib/cards'
import type { HouseholdsDb } from '@/lib/households'
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
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()
  const queryKey = cardsQueryKey({ householdId })

  const cardsQuery = useQuery({
    queryKey,
    queryFn: () => listCards({ db, householdId }),
  })

  const mutation = useMutation({
    mutationFn: (cardName: string) =>
      createCard({ db, householdId, name: cardName }),
    onMutate: () => {
      setError(null)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      setName('')
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
            <li key={card.id} className="text-foreground text-sm font-medium">
              {card.name}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Label htmlFor="new-card-name">Nombre de la tarjeta</Label>
        <div className="flex items-center gap-2">
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

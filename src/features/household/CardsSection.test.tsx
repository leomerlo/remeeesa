import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'
import { createCard, createCardPurchase, listCards } from '@/lib/cards'
import { createHouseholdWithMembership } from '@/lib/households'
import { listCategories } from '@/lib/expenses'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CardsSection } from './CardsSection'

async function seedHousehold() {
  const memory = createMemoryHouseholdsDb()
  const db = memory.asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  return { memory, db, householdId: household.id }
}

// Everything a card is decided in a sheet now -- adding one and editing one
// are the same form, with one "Guardar" writing the name, the brand and the
// currency together. These helpers drive it the way the screen does.
function openAddSheet(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
}

function fillName(name: string): void {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: name } })
}

function submit(name: string | RegExp): void {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('CardsSection', () => {
  it('shows an empty state when the household has no cards', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CardsSection db={db} householdId={householdId} />)

    expect(
      await screen.findByText('Todavía no hay métodos de pago'),
    ).toBeInTheDocument()
  })

  it('creates a card from the sheet and lists it', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay métodos de pago')

    openAddSheet()
    fillName('  Visa  ')
    submit('Agregar método')

    expect(await screen.findByRole('listitem')).toHaveTextContent('Visa')
    expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual([
      'Visa',
    ])
  })

  it('saves the kind, the brand and the currency alongside the name', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay métodos de pago')

    openAddSheet()
    fillName('Amex')
    fireEvent.change(screen.getByLabelText('Marca'), {
      target: { value: 'amex' },
    })
    fireEvent.change(screen.getByLabelText('Moneda'), {
      target: { value: 'BOTH' },
    })
    submit('Agregar método')

    await waitFor(async () => {
      const [card] = await listCards({ db, householdId })
      expect(card?.kind).toBe('credito')
      expect(card?.brand).toBe('amex')
      expect(card?.currency).toBe('BOTH')
    })
  })

  // The ordinary Argentine credit card is billed in pesos and separately in
  // dollars, so that is one of the three things a card can be -- said in
  // words rather than in symbols, which is what "$ y US$" used to be.
  it('offers the three things a card can be', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay métodos de pago')

    openAddSheet()

    expect(
      [...screen.getByLabelText('Moneda').querySelectorAll('option')].map(
        (option) => [option.value, option.textContent],
      ),
    ).toEqual([
      ['ARS', 'Pesos'],
      ['USD', 'Dólares'],
      ['BOTH', 'Pesos y dólares'],
    ])
  })

  it('rejects a blank name and creates nothing', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay métodos de pago')

    openAddSheet()
    fillName('   ')
    submit('Agregar método')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ingresá un nombre para la tarjeta',
    )
    expect(await listCards({ db, householdId })).toEqual([])
  })

  it('rejects a name that only differs in case from an existing card', async () => {
    const { db, householdId } = await seedHousehold()
    await createCard({ db, householdId, name: 'Visa' })
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Visa')

    openAddSheet()
    fillName('visa')
    submit('Agregar método')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una tarjeta con ese nombre.',
    )
    expect(screen.getByLabelText('Nombre')).toHaveValue('visa')
    expect(await listCards({ db, householdId })).toHaveLength(1)
  })

  it('shows an error when the cards cannot be loaded', async () => {
    const { memory, householdId } = await seedHousehold()

    renderWithProviders(
      <CardsSection db={memory.asUser('outsider')} householdId={householdId} />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo los integrantes del hogar pueden acceder a este hogar',
    )
  })

  it('shows a second member the cards the first one created', async () => {
    const { memory, db, householdId } = await seedHousehold()
    memory.addMember({ userId: 'user-2', householdId })
    await createCard({ db, householdId, name: 'Visa' })

    renderWithProviders(
      <CardsSection db={memory.asUser('user-2')} householdId={householdId} />,
    )

    expect(await screen.findByText('Visa')).toBeInTheDocument()
  })

  it('says in words what a card can be billed in', async () => {
    const { db, householdId } = await seedHousehold()
    await createCard({ db, householdId, name: 'Amex', currency: 'BOTH' })

    renderWithProviders(<CardsSection db={db} householdId={householdId} />)

    expect(await screen.findByRole('listitem')).toHaveTextContent(
      'Pesos y dólares',
    )
  })

  describe('editing', () => {
    async function renderWithCard() {
      const seeded = await seedHousehold()
      await createCard({ ...seeded, name: 'Visa' })
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      renderWithProviders(
        <CardsSection db={seeded.db} householdId={seeded.householdId} />,
        { queryClient },
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Editar Visa' }),
      )
      await screen.findByRole('dialog', { name: 'Editar método' })
      return { ...seeded, queryClient }
    }

    it('starts from the card it was opened on', async () => {
      await renderWithCard()

      expect(screen.getByLabelText('Nombre')).toHaveValue('Visa')
      expect(screen.getByLabelText('Moneda')).toHaveValue('ARS')
    })

    it('saves the trimmed name and lists it', async () => {
      const { db, householdId } = await renderWithCard()

      fillName('  Visa Gold ')
      submit('Guardar')

      expect(
        await screen.findByRole('button', { name: 'Editar Visa Gold' }),
      ).toBeInTheDocument()
      expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual(
        ['Visa Gold'],
      )
    })

    it('re-denominates a card that was recorded in pesos', async () => {
      const { db, householdId } = await renderWithCard()

      fireEvent.change(screen.getByLabelText('Moneda'), {
        target: { value: 'BOTH' },
      })
      submit('Guardar')

      await waitFor(async () => {
        const [card] = await listCards({ db, householdId })
        expect(card?.currency).toBe('BOTH')
      })
    })

    it("refreshes the Resúmenes, which carry the card's name", async () => {
      const { householdId, queryClient } = await renderWithCard()
      const pendientesKey = pendientesQueryKey({ householdId })
      queryClient.setQueryData(pendientesKey, [])

      fillName('Visa Gold')
      submit('Guardar')

      await vi.waitFor(() => {
        expect(queryClient.getQueryState(pendientesKey)?.isInvalidated).toBe(
          true,
        )
      })
    })

    it("rejects another card's name and keeps the sheet open", async () => {
      const { db, householdId } = await renderWithCard()
      await createCard({ db, householdId, name: 'Amex' })

      fillName('amex')
      submit('Guardar')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ya existe una tarjeta con ese nombre.',
      )
      expect(screen.getByLabelText('Nombre')).toHaveValue('amex')
    })

    it('rejects a blank name', async () => {
      await renderWithCard()

      fillName('   ')
      submit('Guardar')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ingresá un nombre para la tarjeta',
      )
    })
  })

  describe('deleting', () => {
    async function renderWithCard() {
      const seeded = await seedHousehold()
      const card = await createCard({ ...seeded, name: 'Visa' })
      renderWithProviders(
        <CardsSection db={seeded.db} householdId={seeded.householdId} />,
      )
      fireEvent.click(
        await screen.findByRole('button', { name: 'Borrar Visa' }),
      )
      return { ...seeded, card }
    }

    // Destructive and irreversible, so it is never the button you pressed:
    // it is the one in the dialog that names the card out loud.
    it('asks before borrando, then deletes', async () => {
      const { db, householdId } = await renderWithCard()

      const dialog = await screen.findByRole('dialog', {
        name: /Borrar «Visa»/,
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Sí, borrar' }),
      )

      await waitFor(async () => {
        expect(await listCards({ db, householdId })).toEqual([])
      })
    })

    it('refuses a card that has a Resumen, and says why', async () => {
      const seeded = await seedHousehold()
      const card = await createCard({ ...seeded, name: 'Visa' })
      const categories = await listCategories({
        db: seeded.db,
        householdId: seeded.householdId,
      })
      const comida = categories.find((category) => category.name === 'Comida')
      if (comida === undefined) {
        throw new Error('expected the Comida category')
      }
      // A purchase is what puts a Resumen on a card, so this is the real
      // way a card ends up with something pointing at it.
      await createCardPurchase({
        db: seeded.db,
        householdId: seeded.householdId,
        cardId: card.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Zapatillas',
        total: 100,
        cuotas: 1,
        purchaseDate: new Date(),
        comments: '',
      })
      renderWithProviders(
        <CardsSection db={seeded.db} householdId={seeded.householdId} />,
      )

      fireEvent.click(
        await screen.findByRole('button', { name: 'Borrar Visa' }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: /Borrar «Visa»/,
      })
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Sí, borrar' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(/Visa/)
      expect(
        await listCards({ db: seeded.db, householdId: seeded.householdId }),
      ).toHaveLength(1)
    })
  })
})

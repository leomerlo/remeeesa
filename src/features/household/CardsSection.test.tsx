import { QueryClient } from '@tanstack/react-query'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pendientesQueryKey } from '@/features/pendientes/queryKeys'
import { createCard, listCards } from '@/lib/cards'
import { createHouseholdWithMembership } from '@/lib/households'
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

function addCard(name: string): void {
  fireEvent.change(screen.getByLabelText('Nombre de la tarjeta'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar tarjeta' }))
}

describe('CardsSection', () => {
  it('shows an empty state when the household has no cards', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CardsSection db={db} householdId={householdId} />)

    expect(
      await screen.findByText('Todavía no hay tarjetas'),
    ).toBeInTheDocument()
  })

  // Disabling the input would drop keyboard focus to <body> mid-save; the
  // section stays open for the next card, so only the button is disabled.
  it('keeps the input focusable while a card is saving', async () => {
    const { db, householdId } = await seedHousehold()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const slowDb = {
      ...db,
      createCard: async (input: Parameters<typeof db.createCard>[0]) => {
        await gate
        return db.createCard(input)
      },
    }
    renderWithProviders(<CardsSection db={slowDb} householdId={householdId} />)
    await screen.findByText('Todavía no hay tarjetas')

    addCard('Visa')

    await vi.waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Agregar tarjeta' }),
      ).toBeDisabled()
    })
    expect(screen.getByLabelText('Nombre de la tarjeta')).toBeEnabled()
    release()
    expect(await screen.findByRole('listitem')).toHaveTextContent('Visa')
  })

  it('creates a card, lists it, and clears the input', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay tarjetas')

    addCard('  Visa  ')

    expect(await screen.findByRole('listitem')).toHaveTextContent('Visa')
    expect(screen.getByLabelText('Nombre de la tarjeta')).toHaveValue('')
    expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual([
      'Visa',
    ])
  })

  it('rejects a blank name and creates nothing', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay tarjetas')

    addCard('   ')

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

    addCard('visa')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe una tarjeta con ese nombre.',
    )
    expect(screen.getByLabelText('Nombre de la tarjeta')).toHaveValue('visa')
    expect(await listCards({ db, householdId })).toHaveLength(1)
  })

  it('clears the error once a valid card is added', async () => {
    const { db, householdId } = await seedHousehold()
    renderWithProviders(<CardsSection db={db} householdId={householdId} />)
    await screen.findByText('Todavía no hay tarjetas')
    addCard('   ')
    await screen.findByRole('alert')

    addCard('Visa')

    expect(await screen.findByRole('listitem')).toHaveTextContent('Visa')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
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

  describe('renaming', () => {
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
        await screen.findByRole('button', { name: 'Renombrar Visa' }),
      )
      return { ...seeded, queryClient }
    }

    function rename(name: string): void {
      fireEvent.change(screen.getByLabelText('Nuevo nombre de Visa'), {
        target: { value: name },
      })
      fireEvent.click(
        screen.getByRole('button', { name: 'Guardar nombre de Visa' }),
      )
    }

    it('starts from the current name', async () => {
      await renderWithCard()

      expect(screen.getByLabelText('Nuevo nombre de Visa')).toHaveValue('Visa')
    })

    it('saves the trimmed name and lists it', async () => {
      const { db, householdId } = await renderWithCard()

      rename('  Visa Gold ')

      expect(
        await screen.findByRole('button', { name: 'Renombrar Visa Gold' }),
      ).toHaveFocus()
      expect(screen.getByRole('listitem')).toHaveTextContent('Visa Gold')
      expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual(
        ['Visa Gold'],
      )
    })

    it("refreshes the Resúmenes, which carry the card's name", async () => {
      const { householdId, queryClient } = await renderWithCard()
      const pendientesKey = [...pendientesQueryKey({ householdId }), 'all']
      queryClient.setQueryData(pendientesKey, [])

      rename('Visa Gold')

      await vi.waitFor(() => {
        expect(queryClient.getQueryState(pendientesKey)?.isInvalidated).toBe(
          true,
        )
      })
    })

    it("rejects another card's name and keeps editing", async () => {
      const { db, householdId } = await renderWithCard()
      await createCard({ db, householdId, name: 'Amex' })

      rename('amex')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ya existe una tarjeta con ese nombre.',
      )
      expect(screen.getByLabelText('Nuevo nombre de Visa')).toHaveValue('amex')
    })

    it('rejects a blank name', async () => {
      await renderWithCard()

      rename('   ')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Ingresá un nombre para la tarjeta',
      )
    })

    it('writes nothing when the name is unchanged', async () => {
      const { db, householdId } = await renderWithCard()
      const renameSpy = vi.spyOn(db, 'renameCard')

      rename(' Visa ')

      expect(
        screen.getByRole('button', { name: 'Renombrar Visa' }),
      ).toHaveFocus()
      expect(renameSpy).not.toHaveBeenCalled()
      expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual(
        ['Visa'],
      )
    })

    it('cancels without saving', async () => {
      const { db, householdId } = await renderWithCard()
      fireEvent.change(screen.getByLabelText('Nuevo nombre de Visa'), {
        target: { value: 'Otra' },
      })

      fireEvent.click(
        screen.getByRole('button', { name: 'Cancelar renombrar Visa' }),
      )

      expect(
        screen.getByRole('button', { name: 'Renombrar Visa' }),
      ).toHaveFocus()
      expect((await listCards({ db, householdId })).map((c) => c.name)).toEqual(
        ['Visa'],
      )
    })
  })
})

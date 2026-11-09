import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RESUMEN_CATEGORY_NAME } from '@/lib/cards'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MonthProvider } from '../MonthContext'
import { Proyecciones } from './Proyecciones'
import type { BetaSession } from '../data'

const FLOR = 'flor'

// A house whose only line in next month's projection is a card bill: one
// purchase in one cuota, which lands whole in the month the screen opens
// on. Everything else is left out so the figure on screen can only be the
// card's.
async function houseWithACardBill(): Promise<BetaSession> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const tarjeta = await db.findOrCreateCategory({
    householdId: household.id,
    name: RESUMEN_CATEGORY_NAME,
  })
  const ropa = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Ropa',
  })
  const card = await db.createCard({
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
    brand: 'visa',
  })
  await db.createCardPurchase({
    householdId: household.id,
    cardId: card.id,
    categoryId: ropa.id,
    resumenCategoryId: tarjeta.id,
    memberId: FLOR,
    authorDisplayName: 'Flor',
    name: 'Zapatillas',
    total: 60_000,
    cuotas: 1,
    purchaseDate: new Date(),
    comments: '',
    currency: 'ARS',
  })
  return {
    userId: FLOR,
    householdId: household.id,
    displayName: 'Flor',
    db,
    adopt: vi.fn(),
    rename: vi.fn(),
  }
}

// The screen pages its own month, but it still sits inside the app's --
// the pager reads it to know whether there is a month ahead to go to.
function render(session: BetaSession): void {
  renderWithProviders(
    <MonthProvider>
      <Proyecciones session={session} />
    </MonthProvider>,
  )
}

// A projection is where somebody says "este mes sí vamos a gastar en
// esto", so every category the household has is on it -- including the
// ones neither month has anything in, which reading the two months alone
// never yields.
describe('the categories with nothing in them', () => {
  it('lists them at zero, beside the ones that have something', async () => {
    render(await houseWithACardBill())

    expect(await screen.findByLabelText('Cuánto va a ser Visa')).toHaveValue(
      '60000',
    )
    // Ropa is the category the purchase was filed under, and nothing was
    // ever spent in it: a card purchase is not a gasto of any month.
    // Empty rather than a literal 0: the 0 is the placeholder, so typing
    // into it does not land "025000".
    expect(screen.getByLabelText('Cuánto va a ser Ropa')).toHaveValue('')
    expect(screen.getAllByText('Sin movimientos').length).toBeGreaterThan(0)
  })

  it('counts one as soon as a figure is typed into it', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Ropa'), {
      target: { value: '25000' },
    })

    expect(screen.getByText('$85.000')).toBeInTheDocument()
  })
})

// The card's line is the one the app can fill in before the bill exists --
// and the one that is knowably short, because next month's own shopping is
// not in it. So it has to be possible to put a figure in over it, and to
// get back to the app's.
describe('typing over what the card is going to be', () => {
  it('offers the cuotas already bought, and says what is missing from them', async () => {
    render(await houseWithACardBill())

    expect(await screen.findByLabelText('Cuánto va a ser Visa')).toHaveValue(
      '60000',
    )
    expect(screen.getByText('Cuotas ya compradas')).toBeInTheDocument()
    expect(
      screen.getByText(/Lo que compren ese mes todavía no está acá/),
    ).toBeInTheDocument()
  })

  it('takes a figure typed over it, into the total and into the line', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Visa'), {
      target: { value: '150000' },
    })

    expect(screen.getByText('$150.000')).toBeInTheDocument()
    // The badge says where a line's figure comes from, so once it comes
    // from the household it stops claiming to be the cuotas.
    expect(screen.getByText('Puesto a mano')).toBeInTheDocument()
    expect(screen.queryByText('Cuotas ya compradas')).not.toBeInTheDocument()
  })

  it('gives the way back to the estimate, naming it', async () => {
    render(await houseWithACardBill())

    fireEvent.change(await screen.findByLabelText('Cuánto va a ser Visa'), {
      target: { value: '150000' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Volver al estimado ($60.000)' }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText('Cuánto va a ser Visa')).toHaveValue('60000')
    })
    expect(screen.getByText('Cuotas ya compradas')).toBeInTheDocument()
  })
})

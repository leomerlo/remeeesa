import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCard,
  createCardPurchase,
  markResumenPaid,
  setResumenAmount,
} from '@/lib/cards'
import { listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { getPendiente, listPendientes } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ResumenSheet } from './ResumenSheet'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 20, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ResumenSheet', () => {
  it("shows an error, not an empty Resumen, when its purchases can't be read", async () => {
    const memoryDb = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: memoryDb,
      userId: 'user-1',
      name: 'Casa',
      monthlyBudget: 1000,
    })
    const householdId = household.id
    const [category] = await listCategories({ db: memoryDb, householdId })
    if (category === undefined) {
      throw new Error('expected a seeded category')
    }
    const visa = await createCard({ db: memoryDb, householdId, name: 'Visa' })
    await createCardPurchase({
      db: memoryDb,
      householdId,
      cardId: visa.id,
      categoryId: category.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Zapatillas',
      total: 120,
      cuotas: 1,
      purchaseDate: new Date(2026, 8, 5),
      comments: '',
    })
    const [resumen] = await listPendientes({ db: memoryDb, householdId })
    if (resumen === undefined) {
      throw new Error('expected a Resumen')
    }
    const db: HouseholdsDb = {
      ...memoryDb,
      getCardPurchases: () =>
        Promise.reject(new Error('No se pudo cargar las compras del resumen')),
    }

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar las compras del resumen',
    )
    expect(
      screen.queryByRole('list', { name: 'Cuotas del resumen' }),
    ).not.toBeInTheDocument()
  })
})

async function setupResumen() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa',
    monthlyBudget: 1000,
  })
  const householdId = household.id
  const [category] = await listCategories({ db, householdId })
  if (category === undefined) {
    throw new Error('expected a seeded category')
  }
  const visa = await createCard({ db, householdId, name: 'Visa' })
  await createCardPurchase({
    db,
    householdId,
    cardId: visa.id,
    categoryId: category.id,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Zapatillas',
    total: 120,
    cuotas: 1,
    purchaseDate: new Date(2026, 8, 5),
    comments: '',
  })
  const [created] = await listPendientes({ db, householdId })
  if (created === undefined) {
    throw new Error('expected a Resumen')
  }
  // A Resumen owes nothing until the statement arrives: these tests are
  // about paying one, so they load it first, exactly as the screen makes
  // you. The flow of loading it is its own describe below.
  const resumen = await setResumenAmount({
    db,
    householdId,
    resumenId: created.id,
    amount: 120,
  })
  return { db, householdId, resumen, estimated: created }
}

function octoberExpenses(db: HouseholdsDb, householdId: string) {
  return listExpensesInMonth({
    db,
    householdId,
    monthStart: new Date(2026, 9, 1),
    monthEnd: new Date(2026, 9, 31, 23, 59, 59, 999),
  })
}

// The whole point of the two figures: what the household logs is an
// estimate of a bill, and the bill is what the card says when the statement
// closes. Per direct feedback -- "no se tiene que sumar automáticamente".
describe('ResumenSheet loading the statement', () => {
  it('shows the estimate, offers no way to pay it, and loads the real figure', async () => {
    const { db, householdId, estimated } = await setupResumen()
    // Back to "the statement has not arrived": the setup loads it for the
    // paying tests, this one is about the moment before that.
    const pending = { ...estimated, expectedAmount: null }

    renderWithProviders(
      <ResumenSheet
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        resumen={pending}
        onClose={() => {}}
      />,
    )

    expect(await screen.findByText('Estimado')).toBeInTheDocument()
    expect(screen.getByText('$120')).toBeInTheDocument()
    // Nothing to pay yet: paying an estimate is exactly what this replaced.
    expect(
      screen.queryByRole('button', { name: 'Pagar resumen' }),
    ).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Lo que llegó en el resumen'), {
      target: { value: '150' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cargar el resumen' }))

    await waitFor(async () => {
      const loaded = await getPendiente({
        db,
        householdId,
        pendienteId: pending.id,
      })
      expect(loaded?.expectedAmount).toBe(150)
      // The estimate is untouched: it is the household's own record, and
      // the comparison is the point.
      expect(loaded?.estimatedAmount).toBe(120)
    })
  })

  it('says how far off the estimate was once the real figure is in', async () => {
    const { db, householdId, resumen } = await setupResumen()

    renderWithProviders(
      <ResumenSheet
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        resumen={{ ...resumen, expectedAmount: 150 }}
        onClose={() => {}}
      />,
    )

    expect(
      await screen.findByText('$120 · $30 más de lo que esperabas.', {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('says so when the card billed exactly what was logged', async () => {
    const { db, householdId, resumen } = await setupResumen()

    renderWithProviders(
      <ResumenSheet
        db={db}
        householdId={householdId}
        memberId="user-1"
        authorDisplayName="Ada"
        resumen={resumen}
        onClose={() => {}}
      />,
    )

    expect(
      await screen.findByText(/Igual a los \$120 que habías cargado/),
    ).toBeInTheDocument()
  })
})

describe('ResumenSheet paying', () => {
  it("can't be paid before its month starts", async () => {
    const { db, householdId, resumen } = await setupResumen()

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={() => {}}
      />,
    )

    expect(
      await screen.findByRole('button', { name: 'Pagar resumen' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Se puede pagar desde el 01/10/2026.'),
    ).toBeInTheDocument()
  })

  it('pays the amount entered, defaulting to the total, and closes', async () => {
    const { db, householdId, resumen } = await setupResumen()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const onClose = vi.fn()

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={onClose}
      />,
    )

    const amount = await screen.findByLabelText('Monto pagado')
    expect(amount).toHaveValue('120')
    expect(screen.getByLabelText('Fecha de pago')).toHaveValue('2026-10-15')
    fireEvent.change(amount, { target: { value: '125' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar resumen' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(
      (await octoberExpenses(db, householdId)).map((e) => [e.name, e.price]),
    ).toEqual([
      ['Zapatillas', 120],
      ['Visa — ajuste', 5],
    ])
  })

  it('shows why a payment was refused', async () => {
    const { db, householdId, resumen } = await setupResumen()
    vi.setSystemTime(new Date(2026, 9, 15, 12))

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={() => {}}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Monto pagado'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar resumen' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El precio del gasto debe ser un número positivo',
    )
  })

  it('says so when someone else already paid it', async () => {
    const { db, householdId, resumen } = await setupResumen()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    await markResumenPaid({
      db,
      householdId,
      resumenId: resumen.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      amountPaid: 120,
      paymentDate: new Date(2026, 9, 15),
    })

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={resumen}
        onClose={() => {}}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Pagar resumen' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El resumen de Visa de octubre de 2026 ya está pagado.',
    )
    expect(await octoberExpenses(db, householdId)).toHaveLength(1)
  })

  it('undoes a payment, deleting its expenses', async () => {
    const { db, householdId, resumen } = await setupResumen()
    vi.setSystemTime(new Date(2026, 9, 15, 12))
    const { pendiente } = await markResumenPaid({
      db,
      householdId,
      resumenId: resumen.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      amountPaid: 120,
      paymentDate: new Date(2026, 9, 15),
    })
    const onClose = vi.fn()

    renderWithProviders(
      <ResumenSheet
        memberId="user-1"
        authorDisplayName="Ada"
        db={db}
        householdId={householdId}
        resumen={pendiente}
        onClose={onClose}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Pagar resumen' })).toBeNull()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Deshacer pago' }),
    )

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    expect(await octoberExpenses(db, householdId)).toEqual([])
    expect(
      (await getPendiente({ db, householdId, pendienteId: resumen.id }))
        ?.status,
    ).toBe('pending')
  })
})

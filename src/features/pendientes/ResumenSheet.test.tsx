import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCard, createCardPurchase, markResumenPaid } from '@/lib/cards'
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
  const [resumen] = await listPendientes({ db, householdId })
  if (resumen === undefined) {
    throw new Error('expected a Resumen')
  }
  return { db, householdId, resumen }
}

function octoberExpenses(db: HouseholdsDb, householdId: string) {
  return listExpensesInMonth({
    db,
    householdId,
    monthStart: new Date(2026, 9, 1),
    monthEnd: new Date(2026, 9, 31, 23, 59, 59, 999),
  })
}

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

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closingDayFor,
  createCard,
  createCardPurchase,
  listCards,
} from '@/lib/cards'
import type { Card as PaymentMethod } from '@/lib/cards'
import { resumenIdFor } from '@/lib/cards/cuotas'
import { listCategories } from '@/lib/expenses'
import type { Household } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { MetodoSheet } from './MetodoSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
const TODAY = new Date(2026, 10, 27, 12)
const DECEMBER = new Date(2026, 11, 1)
const JANUARY = new Date(2027, 0, 1)

beforeEach(() => {
  vi.setSystemTime(TODAY)
})

async function house(): Promise<{
  readonly session: BetaSession
  readonly household: Household
  readonly visa: PaymentMethod
  readonly buy: (day: number, name: string, total: number) => Promise<void>
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const visa = await createCard({
    db,
    householdId: household.id,
    name: 'Visa',
    kind: 'credito',
    currency: 'ARS',
  })
  const categories = await listCategories({ db, householdId: household.id })
  const category = categories[0]
  if (category === undefined) throw new Error('expected a seeded category')
  const buy = async (day: number, name: string, total: number) => {
    await createCardPurchase({
      db,
      householdId: household.id,
      cardId: visa.id,
      categoryId: category.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      name,
      total,
      cuotas: 1,
      purchaseDate: new Date(2026, 10, day, 12),
      comments: '',
    })
  }
  return {
    household,
    visa,
    buy,
    session: {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    },
  }
}

function open(
  it_: Awaited<ReturnType<typeof house>>,
  method: PaymentMethod,
  onClose = vi.fn(),
): void {
  renderWithProviders(
    <MetodoSheet
      open
      onClose={onClose}
      session={it_.session}
      method={method}
      existing={[method]}
    />,
  )
}

async function totalOf(
  it_: Awaited<ReturnType<typeof house>>,
  monthStart: Date,
): Promise<number | null> {
  const resumen = await it_.session.db.getPendiente({
    householdId: it_.household.id,
    pendienteId: resumenIdFor(it_.visa.id, monthStart),
  })
  return resumen?.estimatedAmount ?? null
}

describe('telling a credit card what day it closes', () => {
  it('is asked for on a credit card and nowhere else', async () => {
    const it_ = await house()
    open(it_, it_.visa)
    expect(
      await screen.findByLabelText('Qué día cierra el resumen'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByText('Efectivo'))
    await waitFor(() => {
      expect(screen.queryByLabelText('Qué día cierra el resumen')).toBeNull()
    })
  })

  it('moves what was bought on or after it, and says how many', async () => {
    const it_ = await house()
    await it_.buy(25, 'Antes', 1000)
    await it_.buy(26, 'El día', 2000)
    await it_.buy(27, 'Después', 3000)
    expect(await totalOf(it_, DECEMBER)).toBe(6000)

    open(it_, it_.visa)
    fireEvent.change(
      await screen.findByLabelText('Qué día cierra el resumen'),
      { target: { value: '26' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText(/Se movieron 2 consumos al resumen siguiente/),
    ).toBeInTheDocument()
    expect(await totalOf(it_, DECEMBER)).toBe(1000)
    expect(await totalOf(it_, JANUARY)).toBe(5000)
  })

  it('stays open after moving something, so nobody misses it', async () => {
    const it_ = await house()
    await it_.buy(27, 'Después', 3000)
    const onClose = vi.fn()

    open(it_, it_.visa, onClose)
    fireEvent.change(
      await screen.findByLabelText('Qué día cierra el resumen'),
      { target: { value: '26' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByText(/Se movió 1 consumo/)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes as usual when the day moved nothing', async () => {
    const it_ = await house()
    await it_.buy(5, 'Temprano', 1000)
    const onClose = vi.fn()

    open(it_, it_.visa, onClose)
    fireEvent.change(
      await screen.findByLabelText('Qué día cierra el resumen'),
      { target: { value: '26' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled()
    })
    const cards = await listCards({
      db: it_.session.db,
      householdId: it_.household.id,
    })
    expect(closingDayFor(cards[0]?.closings ?? {}, '2026-11')).toBe(26)
  })
})

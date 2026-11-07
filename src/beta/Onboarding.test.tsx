import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { HouseholdsDb } from '@/lib/households'
import { Onboarding } from './Onboarding'
import { createSandbox } from './sandbox'
import { sandboxDb } from './sandboxDb'
import type { BetaSession } from './data'

const USER = 'suegro'

function setUp(): {
  readonly raw: HouseholdsDb
  readonly session: BetaSession
  readonly adopt: ReturnType<typeof vi.fn>
} {
  const raw = createMemoryHouseholdsDb().asUser(USER)
  const sandbox = createSandbox(null)
  const adopt = vi.fn()
  return {
    raw,
    adopt,
    session: {
      userId: USER,
      householdId: null,
      displayName: null,
      db: sandboxDb(raw, sandbox),
      sandbox,
      adopt,
    },
  }
}

function render(session: BetaSession) {
  return renderWithProviders(<Onboarding session={session} />, {
    client: createFirebaseStub({
      auth: {
        currentUser: { uid: USER, displayName: 'Jorge', email: null },
      },
    } as never),
  })
}

// The first two minutes of a brand-new house, end to end: what somebody
// types here is what ends up in the database, and nothing is written until
// the last answer is in.
describe('setting up a house for the first time', () => {
  it('writes the house, its payment methods and its budget, once', async () => {
    const { raw, session, adopt } = setUp()
    render(session)

    // 1 -- the name
    fireEvent.change(screen.getByLabelText('Nombre del hogar'), {
      target: { value: 'Casa de Jorge' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    // 2 -- how they pay, and the one card they have
    fireEvent.click(screen.getByRole('checkbox', { name: /Crédito/ }))
    fireEvent.change(screen.getByLabelText('¿Qué tarjeta de crédito tenés?'), {
      target: { value: 'Visa Galicia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Agregar/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    // Nothing has been written yet: a house half set up is worse than none.
    expect(await raw.getMembership(USER)).toBeNull()

    // 3 -- the budget, which is the step that saves
    fireEvent.change(screen.getByLabelText('Presupuesto mensual'), {
      target: { value: '400000' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar el presupuesto' }),
    )

    await waitFor(() => {
      expect(screen.getByText('Listo, ya pueden empezar')).toBeInTheDocument()
    })

    const membership = await raw.getMembership(USER)
    expect(membership).not.toBeNull()
    const householdId = membership?.householdId ?? ''
    const household = await raw.getHousehold(householdId)
    expect(household.name).toBe('Casa de Jorge')
    expect(household.monthlyBudget).toBe(400_000)
    const cards = await raw.listCards({ householdId })
    expect(cards.map((card) => [card.name, card.kind])).toEqual([
      ['Visa Galicia', 'credito'],
    ])

    // 4 -- and only now does the app open
    expect(adopt).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ir a mi hogar' }))
    expect(adopt).toHaveBeenCalledWith(householdId)
  })

  it('lets the budget be skipped, because it is optional', async () => {
    const { raw, session } = setUp()
    render(session)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))

    await waitFor(() => {
      expect(screen.getByText('Listo, ya pueden empezar')).toBeInTheDocument()
    })
    const membership = await raw.getMembership(USER)
    const household = await raw.getHousehold(membership?.householdId ?? '')
    // Zero is how this app says "no budget", and the Inicio reads it that
    // way: it shows what they spent instead of what is left.
    expect(household.monthlyBudget).toBe(0)
    expect(household.name).toBe('Nuestra casa')
  })

  it('owns the house it made, so its budget can be changed afterwards', async () => {
    const { raw, session } = setUp()
    render(session)

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ahora no' }))

    await waitFor(() => {
      expect(screen.getByText('Listo, ya pueden empezar')).toBeInTheDocument()
    })
    const membership = await raw.getMembership(USER)
    const householdId = membership?.householdId ?? ''
    expect(session.sandbox.owns('household', householdId)).toBe(true)
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Card as PaymentMethod } from '@/lib/cards'
import type { HouseholdsDb } from '@/lib/households'
import { createPendiente } from '@/lib/pendientes'
import type { Pendiente } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PagarSheet, ServicioSheet } from './ServicioSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
// Inside the month the suite's clock is frozen in (25 Sep 2026).
const TODAY = new Date(2026, 8, 20, 12)

async function house(): Promise<{
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly bill: Pendiente
  readonly methods: readonly PaymentMethod[]
  readonly session: BetaSession
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  const servicios = await db.findOrCreateCategory({
    householdId: household.id,
    name: 'Servicios',
  })
  const bill = await createPendiente({
    db,
    householdId: household.id,
    categoryId: servicios.id,
    name: 'Luz',
    dueDate: new Date(2026, 8, 28, 12),
    expectedAmount: 36_800,
    recurring: true,
    autoDebit: false,
    currency: 'ARS',
  })
  return {
    db,
    householdId: household.id,
    bill,
    methods: [],
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

// The bill arrives before anybody pays it, and the figure on it is almost
// never the figure that was expected. Writing that figure down is not the
// same as saying the money has left the account -- and until now this
// form could only do the second, so correcting an amount meant claiming a
// payment that had not happened.
describe('paying a servicio', () => {
  it('saves the amount and leaves it waiting', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '41200' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Guardar el monto/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.expectedAmount).toBe(41_200)
    })
    const after = await it.db.getPendiente({
      householdId: it.householdId,
      pendienteId: it.bill.id,
    })
    // Still owed: nobody said it was paid.
    expect(after?.status).toBe('pending')
    expect(after?.paidExpenseId ?? null).toBeNull()
  })

  it('still pays it when that is what was asked', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '41200' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Marcar como pagado/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.status).toBe('paid')
    })
    const after = await it.db.getPendiente({
      householdId: it.householdId,
      pendienteId: it.bill.id,
    })
    expect(after?.paidExpenseId ?? null).not.toBeNull()
  })
})

// Going to pay it without the whole figure in hand. The money handed
// over is a Gasto of its own and the bill stays open owing the rest, so
// the one thing worth asserting is that it did not settle. Per direct
// feedback: "pagué X y me falta X".
describe('paying part of a servicio', () => {
  it('leaves the bill open owing the rest', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '20000' },
    })
    fireEvent.click(screen.getByRole('switch', { name: /Pagué solo una parte/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar lo que pagué/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.paidSoFar).toBe(20_000)
    })
    const after = await it.db.getPendiente({
      householdId: it.householdId,
      pendienteId: it.bill.id,
    })
    // Not settled, and still asking for what it always asked for -- the
    // bill did not get cheaper, part of it got paid.
    expect(after?.status).toBe('pending')
    expect(after?.paidExpenseId ?? null).toBeNull()
    expect(after?.expectedAmount).toBe(36_800)
    // And the money that left is in the month as a gasto of its own.
    const gastos = await it.db.listRecentExpenses({
      householdId: it.householdId,
      limit: 10,
    })
    expect(gastos.map((one) => one.price)).toEqual([20_000])
  })

  it('offers what is left, not the whole figure, once part is in', async () => {
    const it = await house()
    const { pendiente } = await it.db.payPendientePartially({
      householdId: it.householdId,
      pendienteId: it.bill.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      amount: 20_000,
      paymentDate: TODAY,
    })
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={pendiente}
        methods={it.methods}
        today={TODAY}
      />,
    )

    expect(screen.getByLabelText('Cuánto pagaron')).toHaveValue('16.800')
    expect(
      screen.getByText(/Ya van .* de .*, así que falta/),
    ).toBeInTheDocument()
  })

  it('holds the question shut while the amount covers the whole bill', async () => {
    const it = await house()
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={it.bill}
        methods={it.methods}
        today={TODAY}
      />,
    )

    // The form opens offering the whole figure, which leaves nothing to
    // be a part of.
    expect(
      screen.getByRole('switch', { name: /Pagué solo una parte/ }),
    ).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Cuánto pagaron'), {
      target: { value: '20000' },
    })
    expect(
      screen.getByRole('switch', { name: /Pagué solo una parte/ }),
    ).toBeEnabled()
  })

  it('pays the rest and settles it', async () => {
    const it = await house()
    const { pendiente } = await it.db.payPendientePartially({
      householdId: it.householdId,
      pendienteId: it.bill.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      amount: 20_000,
      paymentDate: TODAY,
    })
    renderWithProviders(
      <PagarSheet
        open
        onClose={vi.fn()}
        session={it.session}
        bill={pendiente}
        methods={it.methods}
        today={TODAY}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Marcar como pagado/ }))

    await waitFor(async () => {
      const after = await it.db.getPendiente({
        householdId: it.householdId,
        pendienteId: it.bill.id,
      })
      expect(after?.status).toBe('paid')
    })
    // Both payments are in the month, and they add up to the bill.
    const gastos = await it.db.listRecentExpenses({
      householdId: it.householdId,
      limit: 10,
    })
    expect(gastos.reduce((sum, one) => sum + one.price, 0)).toBe(36_800)
  })
})

// The two forms ask the same questions, in the same order, with the same
// controls -- so it does not matter which screen somebody came from, and
// a record filed as the wrong kind can be put right from the form that
// holds everything else about it. Per direct feedback: "el formulario de
// alta de gasto o servicio es el mismo para todo".
describe('the servicio form asks what the gasto form asks', () => {
  function edit(it_: Awaited<ReturnType<typeof house>>, bill: Pendiente): void {
    renderWithProviders(
      <ServicioSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        bill={bill}
        categories={[]}
        methods={it_.methods}
        today={TODAY}
      />,
    )
  }

  async function categories(
    it_: Awaited<ReturnType<typeof house>>,
  ): Promise<readonly { id: string; name: string }[]> {
    return it_.db.listCategories(it_.householdId)
  }

  it('takes a category nobody has yet, like anotar un gasto does', async () => {
    const it_ = await house()
    const made = await categories(it_)
    renderWithProviders(
      <ServicioSheet
        open
        onClose={vi.fn()}
        session={it_.session}
        bill={it_.bill}
        categories={made.map((category) => ({
          ...category,
          householdId: it_.householdId,
          color: '#4e4c56',
          monthlyBudget: 0,
          createdAt: TODAY,
        }))}
        methods={it_.methods}
        today={TODAY}
      />,
    )

    fireEvent.focus(screen.getByLabelText('Categoría'))
    fireEvent.change(screen.getByLabelText('Categoría'), {
      target: { value: 'Impuestos' },
    })
    fireEvent.click(screen.getByRole('option', { name: /Crear «Impuestos»/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect((await categories(it_)).map((one) => one.name)).toContain(
        'Impuestos',
      )
    })
    const impuestos = (await categories(it_)).find(
      (one) => one.name === 'Impuestos',
    )
    const after = await it_.db.getPendiente({
      householdId: it_.householdId,
      pendienteId: it_.bill.id,
    })
    expect(after?.categoryId).toBe(impuestos?.id)
  })

  it('settles the bill when Ya lo pagué is turned on', async () => {
    const it_ = await house()
    edit(it_, it_.bill)

    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      const after = await it_.db.getPendiente({
        householdId: it_.householdId,
        pendienteId: it_.bill.id,
      })
      expect(after?.status).toBe('paid')
    })
  })

  it('undoes the payment when it is turned off again', async () => {
    const it_ = await house()
    const { pendiente } = await it_.db.markPendientePaid({
      householdId: it_.householdId,
      pendienteId: it_.bill.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      finalAmount: 36_800,
      paymentDate: TODAY,
    })
    edit(it_, pendiente)

    fireEvent.click(screen.getByRole('switch', { name: /Ya lo pagué/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      const after = await it_.db.getPendiente({
        householdId: it_.householdId,
        pendienteId: it_.bill.id,
      })
      expect(after?.status).toBe('pending')
    })
    // And the gasto that payment had written is gone with it.
    expect(
      await it_.db.listRecentExpenses({
        householdId: it_.householdId,
        limit: 10,
      }),
    ).toEqual([])
  })

  // Where a record is read is decided by the gasto's own flag, written
  // when the money moved. Turning recurrence off on a paid bill has to
  // tell it, or the record stays off Gastos for ever.
  it('moves a paid one back to the gastos when it stops repeating', async () => {
    const it_ = await house()
    const { pendiente } = await it_.db.markPendientePaid({
      householdId: it_.householdId,
      pendienteId: it_.bill.id,
      memberId: FLOR,
      authorDisplayName: 'Flor',
      finalAmount: 36_800,
      paymentDate: TODAY,
    })
    expect(
      (
        await it_.db.listRecentExpenses({
          householdId: it_.householdId,
          limit: 10,
        })
      )[0]?.isService,
    ).toBe(true)
    edit(it_, pendiente)

    fireEvent.click(screen.getByRole('switch', { name: /Todos los meses/ }))
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }))

    await waitFor(async () => {
      expect(
        (
          await it_.db.listRecentExpenses({
            householdId: it_.householdId,
            limit: 10,
          })
        )[0]?.isService,
      ).toBe(false)
    })
  })
})

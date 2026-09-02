import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createCuenta, listPendingCuentas, markCuentaPaid } from '@/lib/cuentas'
import { currentMonthRange, listCategories, listExpensesInMonth } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CuentasPage } from './CuentasPage'

// Same local copy of the row's date formatting that
// PendingCuentasList.test.tsx keeps, rather than importing formatShortDate --
// asserting against the very function under render would pass even if the
// formatting changed underneath.
function formatCuentaDueDate(date: Date): string {
  return date.toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function renderCuentasPage(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/cuentas']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/cuentas" element={ui} />
      </Routes>
    </MemoryRouter>,
    options,
  )
}

describe('CuentasPage', () => {
  it('shows a loading status while resolving the session user', () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        authStateReady: () => new Promise(() => {}),
        onAuthStateChanged: () => () => {},
      },
    })

    renderCuentasPage(
      <CuentasPage householdsDb={createMemoryHouseholdsDb().asUser('user-1')} />,
      { client },
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  it('shows a loading status before membership resolves', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Cuentas' }),
      ).toBeInTheDocument()
    })
  })

  it('redirects to home when the user is signed out', () => {
    renderCuentasPage(
      <CuentasPage
        currentUserId={null}
        householdsDb={createMemoryHouseholdsDb().asUser('user-1')}
      />,
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('redirects to home when the user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('redirects to home when the membership lookup fails', async () => {
    const base = createMemoryHouseholdsDb().asUser('user-1')
    const db: HouseholdsDb = {
      ...base,
      getMembership: async () => {
        throw new Error('network error')
      },
    }

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('shows the pending cuentas list and the "Nueva cuenta" trigger for a signed-in member', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    expect(
      await screen.findByRole('heading', { name: 'Cuentas' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Nueva cuenta' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('No hay cuentas pendientes'),
    ).toBeInTheDocument()
  })

  it('opens the add-cuenta form when the "Nueva cuenta" trigger is clicked', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Nueva cuenta' }),
    )

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
  })

  it('opens the mark-paid sheet pre-filled when "Pagar" is clicked, and a successful submit removes the cuenta from the list without a manual refetch', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    const payButton = await screen.findByRole('button', {
      name: 'Marcar pagada Alquiler',
    })
    payButton.focus()
    fireEvent.click(payButton)

    const amountInput = await screen.findByLabelText('Monto pagado')
    expect(amountInput).toHaveValue('500')

    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    // The "Pagar" button that opened the sheet no longer exists once the
    // cuenta drops out of the pending list, so Radix's default close-focus
    // restoration has nothing to return to and would otherwise drop focus
    // to <body> -- the page heading is the fallback landing spot instead.
    expect(screen.getByRole('heading', { name: 'Cuentas' })).toHaveFocus()
    expect(await listPendingCuentas({ db, householdId: household.id })).toEqual(
      [],
    )
    // authorDisplayName is derived from the signed-in Firebase user rather
    // than passed as a test prop (unlike HomePage) -- the default stub has
    // no auth.currentUser at all, so this pins the 'Miembro' fallback branch
    // actually reaching markCuentaPaid instead of silently reaching the db
    // with an empty/undefined value.
    const paidExpenses = await listExpensesInMonth({
      db,
      householdId: household.id,
      ...currentMonthRange(),
    })
    expect(paidExpenses).toEqual([
      expect.objectContaining({
        name: 'Alquiler',
        authorDisplayName: 'Miembro',
      }),
    ])
  })

  // The recurring path is the one payment that does not simply leave the
  // pending list one row shorter: the paid row goes away and the next cycle
  // takes its place. Only the mutation's cache invalidation makes that new
  // row appear -- a lib-level assertion on listPendingCuentas would still
  // pass with a stale query cache, so the "appears immediately" guarantee
  // has to be checked here, on what the member actually sees.
  it('replaces a paid recurring cuenta with its next cycle in the pending list, dated a month later and with a blank amount', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    const paidDueDate = new Date(2026, 8, 10)
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: paidDueDate,
      expectedAmount: 500,
      recurring: true,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagada Alquiler' }),
    )
    await screen.findByLabelText('Monto pagado')
    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    })
    // Both cycles carry the same name, so the due date -- not the name -- is
    // what tells the new row apart from the one just paid.
    await waitFor(() => {
      expect(
        screen.getByText(formatCuentaDueDate(new Date(2026, 9, 10))),
      ).toBeInTheDocument()
    })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Alquiler')
    expect(rows[0]).toHaveTextContent('Comida')
    expect(
      screen.queryByText(formatCuentaDueDate(paidDueDate)),
    ).not.toBeInTheDocument()
    // The paid cycle's $500 must not be carried over: the next cycle has a
    // blank expected amount, so its row renders no amount at all.
    expect(rows[0]).not.toHaveTextContent('$')
  })

  it('keeps the mark-paid sheet open with a clear alert and refreshes the stale row out of the pending list when the cuenta was already paid', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagada Alquiler' }),
    )
    await screen.findByLabelText('Monto pagado')

    // Simulate the Cuenta being marked paid a moment earlier -- e.g. by
    // another household member -- from outside this session's knowledge.
    const [pending] = await listPendingCuentas({ db, householdId: household.id })
    if (pending === undefined) {
      throw new Error('expected the seeded pending cuenta')
    }
    // memoryHouseholdsDb ties `memberId` to the db's bound `asUser` identity,
    // so this reuses "user-1" rather than modeling a distinct second member --
    // what matters for this race is that the cuenta gets marked paid via a
    // separate call before our form's submit reaches the mutation.
    await markCuentaPaid({
      db,
      householdId: household.id,
      cuentaId: pending.id,
      memberId: 'user-1',
      authorDisplayName: 'Leo',
      finalAmount: 500,
      // Fixed, definitively-past date -- avoids a future-date rejection
      // depending on what day the suite happens to run.
      paymentDate: new Date(2024, 0, 1),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Marcar pagada' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta cuenta ya fue pagada',
    )
    // The sheet must stay open -- no false-success state.
    expect(screen.getByLabelText('Monto pagado')).toBeInTheDocument()
    // The documented invalidateQueries-on-error refresh (see
    // MarkCuentaPaidForm.tsx's onError) must actually reach the list behind
    // the sheet, not just be called -- the stale row disappears even before
    // the sheet is dismissed.
    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
  })

  it('restores focus to the Pagar button (not the heading) when Cancelar is clicked, since the row is still there', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    await createCuenta({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderCuentasPage(<CuentasPage currentUserId="user-1" householdsDb={db} />)

    const payButton = await screen.findByRole('button', {
      name: 'Marcar pagada Alquiler',
    })
    payButton.focus()
    fireEvent.click(payButton)

    await screen.findByLabelText('Monto pagado')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Monto pagado')).not.toBeInTheDocument()
    })
    // The row was never removed on a plain cancel, so Radix's own default
    // close-focus restoration already lands correctly on the button that
    // opened the sheet -- the heading fallback must not override it here.
    expect(
      screen.getByRole('button', { name: 'Marcar pagada Alquiler' }),
    ).toHaveFocus()
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  createPendiente,
  listPendientes,
  markPendientePaid,
} from '@/lib/pendientes'
import {
  currentMonthRange,
  listCategories,
  listExpensesInMonth,
} from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createFirebaseStub } from '@/test/firebaseStub'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { PendientesPage } from './PendientesPage'

// Same local copy of the row's date formatting that
// PendientesList.test.tsx keeps, rather than importing formatDate --
// asserting against the very function under render would pass even if the
// formatting changed underneath.
function formatPendienteDueDate(date: Date): string {
  // "06/09/2026". Written long-hand here on purpose: asserting with the
  // very function under render would still pass if the formatting silently
  // changed.
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())}`
}

function renderPendientesPage(
  ui: ReactElement,
  options?: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/pendientes']}>
      <Routes>
        <Route path="/" element={<p>Home</p>} />
        <Route path="/pendientes" element={ui} />
      </Routes>
    </MemoryRouter>,
    options,
  )
}

describe('PendientesPage', () => {
  it('shows a loading status while resolving the session user', () => {
    const client = createFirebaseStub({
      auth: {
        currentUser: null,
        authStateReady: () => new Promise(() => {}),
        onAuthStateChanged: () => () => {},
      },
    })

    renderPendientesPage(
      <PendientesPage
        householdsDb={createMemoryHouseholdsDb().asUser('user-1')}
      />,
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

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Servicios' }),
      ).toBeInTheDocument()
    })
  })

  it('redirects to home when the user is signed out', () => {
    renderPendientesPage(
      <PendientesPage
        currentUserId={null}
        householdsDb={createMemoryHouseholdsDb().asUser('user-1')}
      />,
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('redirects to home when the user has no household', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

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

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('shows the pendientes list and the "Agregar Servicio" trigger for a signed-in member', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    expect(
      await screen.findByRole('heading', { name: 'Servicios' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Agregar Servicio' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('No hay pendientes')).toBeInTheDocument()
  })

  it('opens the add-pendiente form when the "Agregar Servicio" trigger is clicked', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Agregar Servicio' }),
    )

    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
  })

  it('opens the edit sheet with "Ya lo pagué" pre-checked when "Pagar" is clicked, and a successful submit removes the pendiente from the list without a manual refetch', async () => {
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
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    const payButton = await screen.findByRole('button', {
      name: 'Marcar pagado Alquiler',
    })
    payButton.focus()
    fireEvent.click(payButton)

    // The same edit form as tapping the row -- pre-filled from the
    // Pendiente, but with "Ya lo pagué" already checked and a payment-date
    // field revealed, rather than a separate amount-only sheet.
    const amountInput = await screen.findByLabelText('Monto esperado')
    expect(amountInput).toHaveValue('500')
    expect(screen.getByLabelText('Ya lo pagué')).toHaveAttribute(
      'data-state',
      'checked',
    )
    expect(screen.getByLabelText('Fecha de pago')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    await waitFor(() => {
      expect(screen.queryByLabelText('Fecha de pago')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    expect(await listPendientes({ db, householdId: household.id })).toEqual([])
    // authorDisplayName comes from the signed-in member's own household
    // membership (its default here is the generic 'Miembro' fallback) --
    // this pins that value actually reaching markPendientePaid, rather than
    // silently reaching the db with an empty/undefined value.
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

  // Regression: a paid Pendiente's resulting Expense used to be attributed
  // using the raw Firebase Auth profile name, ignoring whatever name a
  // member had chosen for themselves in Ajustes -- silently reverting back
  // to their Google account's name. Per direct feedback.
  it("attributes a paid pendiente's expense using the member's own chosen display name, not their Auth profile name", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Leo',
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    if (comida === undefined) {
      throw new Error('expected seeded Comida category')
    }
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagado Alquiler' }),
    )
    await screen.findByLabelText('Monto esperado')
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
    const paidExpenses = await listExpensesInMonth({
      db,
      householdId: household.id,
      ...currentMonthRange(),
    })
    expect(paidExpenses).toEqual([
      expect.objectContaining({
        name: 'Alquiler',
        authorDisplayName: 'Leo',
      }),
    ])
  })

  // The recurring path is the one payment that does not simply leave the
  // pending list one row shorter: the paid row goes away and the next cycle
  // takes its place. Only the mutation's cache invalidation makes that new
  // row appear -- a lib-level assertion on listPendientes would still
  // pass with a stale query cache, so the "appears immediately" guarantee
  // has to be checked here, on what the member actually sees.
  it('replaces a paid recurring pendiente with its next cycle in the pending list, dated a month later and pre-filled with the amount just paid', async () => {
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
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: paidDueDate,
      expectedAmount: 500,
      recurring: true,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagado Alquiler' }),
    )
    await screen.findByLabelText('Monto esperado')
    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    await waitFor(() => {
      expect(screen.queryByLabelText('Fecha de pago')).not.toBeInTheDocument()
    })
    // Both cycles carry the same name, so the due date -- not the name -- is
    // what tells the new row apart from the one just paid.
    await waitFor(() => {
      expect(
        screen.getByText(formatPendienteDueDate(new Date(2026, 9, 10))),
      ).toBeInTheDocument()
    })

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toHaveTextContent('Alquiler')
    expect(rows[0]).toHaveTextContent('Comida')
    expect(
      screen.queryByText(formatPendienteDueDate(paidDueDate)),
    ).not.toBeInTheDocument()
    // The next cycle is pre-filled with the amount just paid, an editable
    // starting point rather than a blank "$ --,--" placeholder.
    expect(rows[0]).toHaveTextContent('$500,00')
  })

  it('keeps the mark-paid sheet open with a clear alert and refreshes the stale row out of the pending list when the pendiente was already paid', async () => {
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
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    fireEvent.click(
      await screen.findByRole('button', { name: 'Marcar pagado Alquiler' }),
    )
    await screen.findByLabelText('Monto esperado')

    // Simulate the Pendiente being marked paid a moment earlier -- e.g. by
    // another household member -- from outside this session's knowledge.
    const [pending] = await listPendientes({ db, householdId: household.id })
    if (pending === undefined) {
      throw new Error('expected the seeded pending pendiente')
    }
    // memoryHouseholdsDb ties `memberId` to the db's bound `asUser` identity,
    // so this reuses "user-1" rather than modeling a distinct second member --
    // what matters for this race is that the pendiente gets marked paid via a
    // separate call before our form's submit reaches the mutation.
    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pending.id,
      memberId: 'user-1',
      authorDisplayName: 'Leo',
      finalAmount: 500,
      // Fixed, definitively-past date -- avoids a future-date rejection
      // depending on what day the suite happens to run.
      paymentDate: new Date(2024, 0, 1),
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Guardar y marcar pagado' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este pendiente ya fue pagado',
    )
    // The sheet must stay open -- no false-success state.
    expect(screen.getByLabelText('Monto esperado')).toBeInTheDocument()
    // The documented invalidateQueries-on-error refresh (see
    // AddPendienteForm.tsx's onError) must actually reach the list behind
    // the sheet, not just be called -- the stale row disappears even before
    // the sheet is dismissed.
    await waitFor(() => {
      expect(screen.queryByText('Alquiler')).not.toBeInTheDocument()
    })
  })

  it('restores focus to the Agregar Servicio trigger when Cancelar edición is clicked', async () => {
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
    await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Alquiler',
      dueDate: new Date(2026, 8, 10),
      expectedAmount: 500,
    })

    renderPendientesPage(
      <PendientesPage currentUserId="user-1" householdsDb={db} />,
    )

    const payButton = await screen.findByRole('button', {
      name: 'Marcar pagado Alquiler',
    })
    payButton.focus()
    fireEvent.click(payButton)

    await screen.findByLabelText('Monto esperado')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edición' }))

    await waitFor(() => {
      expect(screen.queryByLabelText('Monto esperado')).not.toBeInTheDocument()
    })
    // The row is still there (nothing was saved), but the sheet's own
    // trigger-focus restoration (AddPendienteSheet's, shared by every
    // externally-triggered edit -- see onEditPendiente's identical flow)
    // lands on "Agregar Servicio", not the row's own "Pagar" button.
    expect(
      screen.getByRole('button', { name: 'Agregar Servicio' }),
    ).toHaveFocus()
  })
})

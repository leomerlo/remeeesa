import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createExpense, listCategories, updateExpense } from '@/lib/expenses'
import {
  createHouseholdWithMembership,
  leaveHousehold,
  updateMemberDisplayName,
} from '@/lib/households'
import { createPendiente, markPendientePaid } from '@/lib/pendientes'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { RecentExpensesList } from './RecentExpensesList'

// The overflow "Ver más" link needs a Router in the tree -- every render in
// this file goes through here rather than renderWithProviders directly.
function renderPage(ui: ReactElement) {
  return renderWithProviders(<MemoryRouter>{ui}</MemoryRouter>)
}

function currentMonthDate(day: number): Date {
  const now = new Date()
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    Math.min(day, now.getDate()),
  )
}

function lastMonthDate(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() - 1, 15)
}

function formatExpenseDate(date: Date): string {
  // "06/09/2026". Written long-hand here on purpose: asserting with the
  // very function under render would still pass if the formatting silently
  // changed.
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${String(date.getFullYear())}`
}

describe('RecentExpensesList', () => {
  it('shows an empty state when the household has no expenses at all', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    const { container } = renderPage(
      <RecentExpensesList db={db} householdId={household.id} />,
    )

    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeNull()
  })

  it('lists recent expenses with name, price, category, date, and author, newest first', async () => {
    const realNow = new Date()
    const fixedNow = new Date(
      realNow.getFullYear(),
      realNow.getMonth(),
      28,
      12,
      0,
      0,
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(fixedNow)

    try {
      const store = createMemoryHouseholdsDb()
      const db = store.asUser('user-1')
      const household = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Verde',
        monthlyBudget: 100,
        displayName: 'Ada',
      })
      store.seedMembership({
        userId: 'user-2',
        householdId: household.id,
        displayName: 'Bob',
      })
      const categories = await listCategories({
        db,
        householdId: household.id,
      })
      const comida = categories.find((category) => category.name === 'Comida')
      const transporte = categories.find(
        (category) => category.name === 'Transporte',
      )
      expect(comida).toBeDefined()
      expect(transporte).toBeDefined()
      if (comida === undefined || transporte === undefined) {
        throw new Error('expected seeded categories')
      }

      const earlierDate = currentMonthDate(1)
      const laterDate = currentMonthDate(28)
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: 'Pizza',
        price: 12.5,
        comments: '',
        expenseDate: earlierDate,
      })
      await createExpense({
        db: store.asUser('user-2'),
        householdId: household.id,
        categoryId: transporte.id,
        memberId: 'user-2',
        authorDisplayName: 'Bob',
        name: 'Taxi',
        price: 8.25,
        comments: '',
        expenseDate: laterDate,
      })

      renderPage(<RecentExpensesList db={db} householdId={household.id} />)

      const rows = await screen.findAllByRole('listitem')
      expect(rows).toHaveLength(2)
      expect(rows[0]).toHaveTextContent('Taxi')
      expect(rows[0]).toHaveTextContent('$8,25')
      expect(rows[0]).toHaveTextContent('Transporte')
      expect(rows[0]).toHaveTextContent(formatExpenseDate(laterDate))
      expect(rows[0]).toHaveTextContent('Bob')
      expect(rows[1]).toHaveTextContent('Pizza')
      expect(rows[1]).toHaveTextContent('$12,50')
      expect(rows[1]).toHaveTextContent('Comida')
      expect(rows[1]).toHaveTextContent(formatExpenseDate(earlierDate))
      expect(rows[1]).toHaveTextContent('Ada')
      expect(
        screen.queryByText('Todavía no hay gastos este mes'),
      ).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  // Scoped to the current month, not all-time: a household mid-way through
  // an active month with nothing yet logged should see the empty state, not
  // last month's movements standing in for it.
  it('excludes an expense dated last month and shows the empty state instead', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Old rent',
      price: 40,
      comments: '',
      expenseDate: lastMonthDate(),
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    expect(
      await screen.findByText('Todavía no hay gastos este mes'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Old rent')).not.toBeInTheDocument()
  })

  // Per direct feedback: a servicio (whether linked via a real Pendiente or
  // manually tagged) belongs in Cuentas por pagar and Histórico, not
  // repeated here too.
  it('excludes servicios, whether linked via a Pendiente or manually tagged, showing only one-off gastos', async () => {
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
      throw new Error('expected Comida category')
    }

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Super',
      price: 100,
      comments: '',
      expenseDate: currentMonthDate(15),
    })
    const pendiente = await createPendiente({
      db,
      householdId: household.id,
      categoryId: comida.id,
      name: 'Internet',
      dueDate: currentMonthDate(10),
      expectedAmount: 5000,
    })
    await markPendientePaid({
      db,
      householdId: household.id,
      pendienteId: pendiente.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      finalAmount: 5000,
      paymentDate: currentMonthDate(10),
    })
    const manualServicio = await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Gimnasio',
      price: 8000,
      comments: '',
      expenseDate: currentMonthDate(12),
    })
    await updateExpense({
      db,
      householdId: household.id,
      expenseId: manualServicio.id,
      isService: true,
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    expect(await screen.findByText('Super')).toBeInTheDocument()
    expect(screen.queryByText('Internet')).not.toBeInTheDocument()
    expect(screen.queryByText('Gimnasio')).not.toBeInTheDocument()
  })

  // Ten rows are rendered and the last five carry a class that hides them
  // below `lg` -- so a phone shows five, a desktop window shows ten, and no
  // JS media query is involved. jsdom applies no CSS, so the count here is
  // the rendered ten; the phone's five is the class, asserted below.
  it('renders up to ten rows and offers a "Ver más" link to Histórico', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    // All dated "now" (today, current month) rather than spread across 6
    // distinct days -- the household's calendar could be early enough in
    // the month that 6 distinct valid days don't exist yet. Creation order
    // (expense_date/created_at desc) still gives a stable "most recent 5"
    // without depending on the day of the month this test runs.
    for (let i = 1; i <= 12; i += 1) {
      await createExpense({
        db,
        householdId: household.id,
        categoryId: comida.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name: `Expense ${String(i)}`,
        price: 5,
        comments: '',
        expenseDate: new Date(),
      })
    }

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(10)
    // The first five show at every width; the rest only from `lg`.
    for (const row of rows.slice(0, 5)) {
      expect(row).not.toHaveClass('hidden')
    }
    for (const row of rows.slice(5)) {
      expect(row).toHaveClass('hidden', 'lg:block')
    }
    const link = screen.getByRole('link', { name: 'Ver más' })
    expect(link).toHaveAttribute('href', '/historico')
  })

  it('does not show "Ver más" when there are 5 or fewer expenses this month', async () => {
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
      throw new Error('expected Comida category')
    }
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Solo expense',
      price: 5,
      comments: '',
      expenseDate: new Date(),
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    await screen.findByText('Solo expense')
    expect(
      screen.queryByRole('link', { name: 'Ver más' }),
    ).not.toBeInTheDocument()
  })

  it('shows the stored author display name after the author leaves the household', async () => {
    const store = createMemoryHouseholdsDb()
    const authorDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: authorDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    store.addMember({ userId: 'user-2', householdId: household.id })
    const remainingDb = store.asUser('user-2')
    const categories = await listCategories({
      db: remainingDb,
      householdId: household.id,
    })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db: authorDb,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    await leaveHousehold({ db: authorDb, userId: 'user-1' })

    renderPage(
      <RecentExpensesList db={remainingDb} householdId={household.id} />,
    )

    const row = await screen.findByRole('listitem')
    expect(row).toHaveTextContent('Pizza')
    expect(row).toHaveTextContent('$12,50')
    expect(row).toHaveTextContent('Ada')
  })

  // Regression: authorDisplayName is a snapshot taken when the expense was
  // created, so it used to go stale the moment a member corrected their name
  // in Ajustes -- old rows kept showing the name they'd since changed away
  // from. The row must reflect the member's *current* name, not the one
  // frozen on the expense.
  it("shows the member's current display name, not the stale one stored on the expense", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
      displayName: 'Florencia Sepúlveda',
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }
    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Florencia Sepúlveda',
      name: 'Veterinario',
      price: 9000,
      comments: '',
      expenseDate: new Date(),
    })

    await updateMemberDisplayName({
      db,
      householdId: household.id,
      userId: 'user-1',
      displayName: 'Jlors',
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    const row = await screen.findByRole('listitem')
    expect(row).toHaveTextContent('Jlors')
    expect(row).not.toHaveTextContent('Florencia Sepúlveda')
  })

  // Matches the approved comp: rows are plain, buttonless cards -- tapping
  // one is the only affordance, and it opens the expense for editing.
  // Deleting lives inside that edit form (AddExpenseForm.tsx), not here.
  it('opens a row for editing when tapped', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: 'Friday dinner',
      expenseDate: currentMonthDate(15),
    })

    let editedName: string | null = null
    let editedCategoryName: string | null = null
    renderPage(
      <RecentExpensesList
        db={db}
        householdId={household.id}
        onEditExpense={(expense, categoryName) => {
          editedName = expense.name
          editedCategoryName = categoryName
        }}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Pizza' }))

    expect(editedName).toBe('Pizza')
    expect(editedCategoryName).toBe('Comida')
  })

  // No onEditExpense means no way to act on a tap, so the row degrades to a
  // plain non-interactive card rather than a button that does nothing.
  it('renders a plain (non-button) row when onEditExpense is not provided', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    expect(await screen.findByText('Pizza')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Editar Pizza' }),
    ).not.toBeInTheDocument()
  })

  it("fills each expense's leading icon with its category color", async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const categories = await listCategories({ db, householdId: household.id })
    const comida = categories.find((category) => category.name === 'Comida')
    expect(comida).toBeDefined()
    if (comida === undefined) {
      throw new Error('expected Comida category')
    }

    await createExpense({
      db,
      householdId: household.id,
      categoryId: comida.id,
      memberId: 'user-1',
      authorDisplayName: 'Ada',
      name: 'Pizza',
      price: 12.5,
      comments: '',
      expenseDate: currentMonthDate(15),
    })

    renderPage(<RecentExpensesList db={db} householdId={household.id} />)

    const row = await screen.findByRole('listitem')
    const icon = row.querySelector<HTMLElement>('[data-testid="category-icon"]')
    expect(icon).not.toBeNull()
    expect(icon?.style.getPropertyValue('--swatch-color')).toBe(comida.color)
  })

  it('shows an error when the current user is not a household member', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderPage(
      <RecentExpensesList
        db={store.asUser('user-2')}
        householdId={household.id}
      />,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Solo los integrantes del hogar pueden acceder a este hogar',
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

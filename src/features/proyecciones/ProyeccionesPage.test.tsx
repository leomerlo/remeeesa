import { fireEvent, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createExpense, listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ProyeccionesPage } from './ProyeccionesPage'

describe('ProyeccionesPage', () => {
  it('projects last month, keeps this month, and totals edited values', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa',
      monthlyBudget: 1000,
    })
    const [category, other] = await listCategories({
      db,
      householdId: household.id,
    })
    if (category === undefined || other === undefined)
      throw new Error('expected a category')
    const now = new Date()
    const add = (
      name: string,
      price: number,
      date: Date,
      categoryId = category.id,
    ) =>
      createExpense({
        db,
        householdId: household.id,
        categoryId,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name,
        price,
        comments: '',
        expenseDate: date,
      })
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await add('Alquiler', 100, lastMonth)
    await add('Luz', 20, lastMonth, other.id)
    await add('Alquiler', 110, now)

    renderWithProviders(
      <MemoryRouter>
        <ProyeccionesPage currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Del mes anterior')).toBeInTheDocument()
    expect(screen.getByText('Cargado')).toBeInTheDocument()
    expect(screen.getByText('$130')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(`Monto de ${other.name}`), {
      target: { value: '50' },
    })
    expect(screen.getByText('$160')).toBeInTheDocument()

    // Next month has nothing yet, so it carries over this month's categories.
    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }))
    expect(await screen.findByText('$110')).toBeInTheDocument()
    expect(screen.queryByText('Cargado')).not.toBeInTheDocument()

    // Edits made on the first month are still there when paging back.
    fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }))
    expect(await screen.findByText('$160')).toBeInTheDocument()
  })
})

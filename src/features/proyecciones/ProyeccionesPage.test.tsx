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
    const [category] = await listCategories({ db, householdId: household.id })
    if (category === undefined) throw new Error('expected a category')
    const now = new Date()
    const add = (name: string, price: number, date: Date) =>
      createExpense({
        db,
        householdId: household.id,
        categoryId: category.id,
        memberId: 'user-1',
        authorDisplayName: 'Ada',
        name,
        price,
        comments: '',
        expenseDate: date,
      })
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    await add('Alquiler', 100, lastMonth)
    await add('Luz', 20, lastMonth)
    await add('Alquiler', 110, now)

    renderWithProviders(
      <MemoryRouter>
        <ProyeccionesPage currentUserId="user-1" householdsDb={db} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Del mes pasado')).toBeInTheDocument()
    expect(screen.getByText('Ya cargado')).toBeInTheDocument()
    expect(screen.getByText('$130')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Monto de Luz'), {
      target: { value: '50' },
    })
    expect(screen.getByText('$160')).toBeInTheDocument()
  })
})

import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { listCategories } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { AddCategoryForm } from './AddCategoryForm'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  return { db, householdId: household.id }
}

describe('AddCategoryForm', () => {
  it('creates a new category and calls onAdded', async () => {
    const { db, householdId } = await seedHousehold()
    const onAdded = vi.fn()

    renderWithProviders(
      <AddCategoryForm db={db} householdId={householdId} onAdded={onAdded} />,
    )

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Mascotas' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría' }))

    await vi.waitFor(() => {
      expect(onAdded).toHaveBeenCalledOnce()
    })
    const categories = await listCategories({ db, householdId })
    expect(categories.map((c) => c.name)).toContain('Mascotas')
  })

  it('rejects a blank name without calling onAdded', async () => {
    const { db, householdId } = await seedHousehold()
    const onAdded = vi.fn()

    renderWithProviders(
      <AddCategoryForm db={db} householdId={householdId} onAdded={onAdded} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no puede estar vacío',
    )
    expect(onAdded).not.toHaveBeenCalled()
  })

  // findOrCreateCategory is idempotent by name -- typing an existing
  // category's name here just confirms it already exists rather than
  // erroring, the same behavior every other category-name field in the app
  // already has.
  it('resolves to the existing category when the name already exists, without erroring', async () => {
    const { db, householdId } = await seedHousehold()
    const onAdded = vi.fn()

    renderWithProviders(
      <AddCategoryForm db={db} householdId={householdId} onAdded={onAdded} />,
    )

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Comida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar categoría' }))

    await vi.waitFor(() => {
      expect(onAdded).toHaveBeenCalledOnce()
    })
    const categories = await listCategories({ db, householdId })
    expect(categories.filter((c) => c.name === 'Comida')).toHaveLength(1)
  })
})

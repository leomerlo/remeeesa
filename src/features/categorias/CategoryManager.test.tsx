import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createPendiente } from '@/lib/pendientes/pendientes'
import { createExpense, listCategories } from '@/lib/expenses'
import { CATEGORY_COLOR_PALETTE } from '@/lib/expenses'
import { createHouseholdWithMembership } from '@/lib/households'
import type { HouseholdsDb } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { CategoryManager } from './CategoryManager'

async function seedHousehold() {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 1000,
  })
  const categories = await listCategories({ db, householdId: household.id })
  const byName = new Map(categories.map((c) => [c.name, c]))
  return { db, householdId: household.id, byName }
}

async function seedExpense(input: {
  readonly db: HouseholdsDb
  readonly householdId: string
  readonly categoryId: string
}) {
  return createExpense({
    db: input.db,
    householdId: input.householdId,
    categoryId: input.categoryId,
    memberId: 'user-1',
    authorDisplayName: 'Ada',
    name: 'Super',
    price: 10,
    comments: '',
    expenseDate: new Date(),
  })
}

async function openEditorFor(name: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: `Editar ${name}` }))
  await screen.findByRole('dialog')
}

describe('CategoryManager', () => {
  // The breakdown above only lists categories with spend this month, so an
  // untouched category would otherwise be unreachable -- and an unused one is
  // exactly what somebody wants to rename or delete.
  it('lists every category, including ones with no expenses', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)

    const list = await screen.findByRole('list', {
      name: 'Todas las categorías',
    })
    const names = within(list)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(names.join(' ')).toContain('Comida')
    expect(names.join(' ')).toContain('Salud')
  })

  it('renames a category and keeps its color', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Comida y bebida' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await screen.findByRole('button', { name: 'Editar Comida y bebida' })
    const after = await listCategories({ db, householdId })
    const renamed = after.find((c) => c.name === 'Comida y bebida')
    expect(renamed?.color).toBe(comida.color)
  })

  it('shows the collision message pointing at merge, inline', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    fireEvent.change(screen.getByLabelText('Nombre'), {
      target: { value: 'Transporte' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Uní las dos')
    // The sheet stays open on the failure, so the typed name is still there
    // to correct rather than lost behind a closed dialog.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('changes a category color from the palette', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    const nextColor =
      CATEGORY_COLOR_PALETTE.find((color) => color !== comida.color) ?? ''

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    fireEvent.click(screen.getByRole('radio', { name: `Color ${nextColor}` }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(async () => {
      const after = await listCategories({ db, householdId })
      expect(after.find((c) => c.id === comida.id)?.color).toBe(nextColor)
    })
  })

  it('deletes a category nothing references, after a confirmation', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Salud')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar categoría' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Editar Salud' }),
      ).not.toBeInTheDocument()
    })
  })

  it('refuses to delete a category in use and says to merge instead', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    if (comida === undefined) {
      throw new Error('expected the seeded Comida category')
    }
    await seedExpense({ db, householdId, categoryId: comida.id })

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    fireEvent.click(screen.getByRole('button', { name: 'Borrar categoría' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Uníla con otra')
    // The sheet stays open on the refusal, so the merge control the message
    // points at is right there. (The rows behind it are aria-hidden while the
    // dialog is open, which is why the category's survival is checked in the
    // db rather than by querying for its row.)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const after = await listCategories({ db, householdId })
    expect(after.map((c) => c.id)).toContain(comida.id)
  })

  it('merges a category into another, moving its expenses and pendientes', async () => {
    const { db, householdId, byName } = await seedHousehold()
    const comida = byName.get('Comida')
    const transporte = byName.get('Transporte')
    if (comida === undefined || transporte === undefined) {
      throw new Error('expected the seeded categories')
    }
    const expense = await seedExpense({
      db,
      householdId,
      categoryId: comida.id,
    })
    const pendiente = await createPendiente({
      db,
      householdId,
      categoryId: comida.id,
      name: 'Verdulería',
      dueDate: new Date('2026-12-10T12:00:00'),
      expectedAmount: 500,
    })

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    fireEvent.change(screen.getByLabelText('Unir con otra categoría'), {
      target: { value: transporte.id },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Unir' }))

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Editar Comida' }),
      ).not.toBeInTheDocument()
    })
    expect(
      (await db.getExpense({ householdId, expenseId: expense.id }))?.categoryId,
    ).toBe(transporte.id)
    expect(
      (await db.getPendiente({ householdId, pendienteId: pendiente.id }))
        ?.categoryId,
    ).toBe(transporte.id)
  })

  it('does not offer the category itself as a merge target', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(<CategoryManager db={db} householdId={householdId} />)
    await openEditorFor('Comida')

    const select = screen.getByLabelText('Unir con otra categoría')
    const options = within(select).getAllByRole('option')
    expect(options.map((option) => option.textContent)).not.toContain('Comida')
  })
})

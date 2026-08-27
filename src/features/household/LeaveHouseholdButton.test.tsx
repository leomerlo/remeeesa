import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { LeaveHouseholdButton } from './LeaveHouseholdButton'

describe('LeaveHouseholdButton', () => {
  it('leaves the household when clicked', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<LeaveHouseholdButton db={db} userId="user-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))

    await waitFor(async () => {
      const next = await createHouseholdWithMembership({
        db,
        userId: 'user-1',
        name: 'Casa Azul',
        monthlyBudget: 200,
      })
      expect(next.name).toBe('Casa Azul')
    })
  })
})

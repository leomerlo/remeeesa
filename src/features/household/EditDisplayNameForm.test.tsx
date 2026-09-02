import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createHouseholdWithMembership, getMembership } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { EditDisplayNameForm } from './EditDisplayNameForm'
import { MemberList } from './MemberList'

async function seedHousehold(displayName?: string) {
  const db = createMemoryHouseholdsDb().asUser('user-1')
  const household = await createHouseholdWithMembership({
    db,
    userId: 'user-1',
    name: 'Casa Verde',
    monthlyBudget: 100,
    ...(displayName === undefined ? {} : { displayName }),
  })
  return { db, householdId: household.id }
}

describe('EditDisplayNameForm', () => {
  it('pre-fills the field with the current display name', async () => {
    const { db, householdId } = await seedHousehold('Florencia')

    renderWithProviders(
      <EditDisplayNameForm
        db={db}
        householdId={householdId}
        userId="user-1"
        currentDisplayName="Florencia"
      />,
    )

    expect(screen.getByLabelText('Tu nombre')).toHaveValue('Florencia')
  })

  it('saves a corrected name, e.g. for a membership stuck on the generic fallback', async () => {
    const { db, householdId } = await seedHousehold()

    renderWithProviders(
      <EditDisplayNameForm
        db={db}
        householdId={householdId}
        userId="user-1"
        currentDisplayName="Miembro"
      />,
    )

    fireEvent.change(screen.getByLabelText('Tu nombre'), {
      target: { value: 'Leo Merlo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    await waitFor(async () => {
      const membership = await getMembership({ db, userId: 'user-1' })
      expect(membership?.displayName).toBe('Leo Merlo')
    })
  })

  it('refreshes MemberList immediately after saving, without a page reload', async () => {
    const { db, householdId } = await seedHousehold('Miembro')

    renderWithProviders(
      <>
        <EditDisplayNameForm
          db={db}
          householdId={householdId}
          userId="user-1"
          currentDisplayName="Miembro"
        />
        <MemberList db={db} householdId={householdId} currentUserId="user-1" />
      </>,
    )

    expect(await screen.findByText('Miembro')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Tu nombre'), {
      target: { value: 'Leo Merlo' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    expect(await screen.findByText('Leo Merlo')).toBeInTheDocument()
    expect(screen.queryByText('Miembro')).not.toBeInTheDocument()
  })

  it('rejects a blank name and leaves the stored one unchanged', async () => {
    const { db, householdId } = await seedHousehold('Florencia')

    renderWithProviders(
      <EditDisplayNameForm
        db={db}
        householdId={householdId}
        userId="user-1"
        currentDisplayName="Florencia"
      />,
    )

    fireEvent.change(screen.getByLabelText('Tu nombre'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar nombre' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/nombre/i)
    const membership = await getMembership({ db, userId: 'user-1' })
    expect(membership?.displayName).toBe('Florencia')
  })
})

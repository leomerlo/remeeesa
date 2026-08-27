import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createHouseholdWithMembership,
  getOrCreateHouseholdInvite,
} from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { InviteLinkPanel } from './InviteLinkPanel'

describe('InviteLinkPanel', () => {
  it('displays the shareable invite URL after generate', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <InviteLinkPanel
        db={db}
        householdId={household.id}
        urlBase="https://remeeesa.test"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )

    const invite = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(`https://remeeesa.test/join/${invite.token}`),
      ).toBeInTheDocument()
    })
  })

  it('shows the same URL when generate is clicked twice', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <InviteLinkPanel
        db={db}
        householdId={household.id}
        urlBase="https://remeeesa.test"
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    const invite = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })
    const expectedUrl = `https://remeeesa.test/join/${invite.token}`
    await waitFor(() => {
      expect(screen.getByDisplayValue(expectedUrl)).toBeInTheDocument()
    })

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    await waitFor(() => {
      expect(screen.getByDisplayValue(expectedUrl)).toBeInTheDocument()
    })
  })

  it('copies the shareable invite URL', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })
    const writeText = vi.fn(async () => {})

    renderWithProviders(
      <InviteLinkPanel
        db={db}
        householdId={household.id}
        urlBase="https://remeeesa.test"
        clipboard={{ writeText }}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    const invite = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })
    const expectedUrl = `https://remeeesa.test/join/${invite.token}`
    await waitFor(() => {
      expect(screen.getByDisplayValue(expectedUrl)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expectedUrl)
    })
  })

  it('builds the invite URL from the current origin when urlBase is omitted', async () => {
    const db = createMemoryHouseholdsDb().asUser('user-1')
    const household = await createHouseholdWithMembership({
      db,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(<InviteLinkPanel db={db} householdId={household.id} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )
    const invite = await getOrCreateHouseholdInvite({
      db,
      householdId: household.id,
    })
    await waitFor(() => {
      expect(
        screen.getByDisplayValue(
          `${window.location.origin}/join/${invite.token}`,
        ),
      ).toBeInTheDocument()
    })
  })

  it('shows an error when generate is denied', async () => {
    const store = createMemoryHouseholdsDb()
    const ownerDb = store.asUser('user-1')
    const household = await createHouseholdWithMembership({
      db: ownerDb,
      userId: 'user-1',
      name: 'Casa Verde',
      monthlyBudget: 100,
    })

    renderWithProviders(
      <InviteLinkPanel
        db={store.asUser('user-2')}
        householdId={household.id}
        urlBase="https://remeeesa.test"
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Copy' }),
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate invite link' }),
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Only household members can access this household',
      )
    })
    expect(
      screen.queryByRole('button', { name: 'Copy' }),
    ).not.toBeInTheDocument()
  })
})

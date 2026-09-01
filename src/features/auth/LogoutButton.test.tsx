import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { LogoutButton } from './LogoutButton'

describe('LogoutButton', () => {
  it('calls signOutSession when clicked', async () => {
    const signOutSession = vi.fn(async () => {})
    const onSignedOut = vi.fn()

    renderWithProviders(
      <LogoutButton
        signOutSession={signOutSession}
        onSignedOut={onSignedOut}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    await waitFor(() => {
      expect(signOutSession).toHaveBeenCalledOnce()
    })
    expect(onSignedOut).toHaveBeenCalledOnce()
  })
})

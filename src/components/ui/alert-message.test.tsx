import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertMessage } from './alert-message'

describe('AlertMessage', () => {
  it('renders the message as an alert', () => {
    render(<AlertMessage>No se pudo guardar el pendiente</AlertMessage>)

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo guardar el pendiente',
    )
  })

  it('uses the error token, not the undefined destructive class', () => {
    render(<AlertMessage>Error</AlertMessage>)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('text-error')
    expect(alert).not.toHaveClass('text-destructive')
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LoadingIndicator } from './loading-indicator'

describe('LoadingIndicator', () => {
  it('announces Cargando… by default', () => {
    render(<LoadingIndicator />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  it('accepts a different label', () => {
    render(<LoadingIndicator label="Uniéndote…" />)

    expect(screen.getByRole('status')).toHaveTextContent('Uniéndote…')
  })
})

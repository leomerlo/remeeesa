import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoricoPage } from './HistoricoPage'

describe('HistoricoPage', () => {
  it('renders the Histórico heading', () => {
    render(<HistoricoPage />)

    expect(
      screen.getByRole('heading', { name: 'Histórico' }),
    ).toBeInTheDocument()
  })
})

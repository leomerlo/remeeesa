import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CategoriasPage } from './CategoriasPage'

describe('CategoriasPage', () => {
  it('renders the Categorías heading', () => {
    render(<CategoriasPage />)

    expect(
      screen.getByRole('heading', { name: 'Categorías' }),
    ).toBeInTheDocument()
  })
})

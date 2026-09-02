import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GastoVsPendienteHint } from './GastoVsPendienteHint'

describe('GastoVsPendienteHint', () => {
  it('explains the difference between a Gasto and a Pendiente', () => {
    render(<GastoVsPendienteHint />)

    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('Gasto')
    expect(note).toHaveTextContent('cafecitos o compritas')
    expect(note).toHaveTextContent('Pendiente')
    expect(note).toHaveTextContent('mes a mes')
  })
})

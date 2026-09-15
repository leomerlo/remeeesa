import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmptyState } from './EmptyState'
import { ILLUSTRATIONS } from './illustrations'

describe('EmptyState', () => {
  it('announces the title as a status, so the screen change is spoken', () => {
    render(<EmptyState title="Mes sin movimientos" />)

    expect(screen.getByRole('status')).toHaveTextContent('Mes sin movimientos')
  })

  it('says what belongs here, not only that nothing does', () => {
    render(
      <EmptyState
        title="Ningún servicio este mes"
        description="Alquiler, internet, expensas."
      />,
    )

    expect(
      screen.getByText('Alquiler, internet, expensas.'),
    ).toBeInTheDocument()
  })

  it('renders the chosen drawing, hidden from assistive technology', () => {
    const { container } = render(
      <EmptyState illustration={ILLUSTRATIONS.saving} title="Sin servicios" />,
    )

    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', ILLUSTRATIONS.saving)
    // The title beside it already says the same thing.
    expect(img).toHaveAttribute('aria-hidden', 'true')
  })

  it('omits the drawing entirely for a transient state such as a search miss', () => {
    const { container } = render(
      <EmptyState
        title="Sin resultados"
        description="Probá con otra palabra."
      />,
    )

    expect(container.querySelector('img')).toBeNull()
  })

  it('renders an action when the screen has an obvious next move', () => {
    render(
      <EmptyState
        title="Todavía no anotaron nada"
        action={<button type="button">Agregar gasto</button>}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Agregar gasto' }),
    ).toBeInTheDocument()
  })

  it('is a card, so an empty screen still has something composed on it', () => {
    const { container } = render(<EmptyState title="Mes sin movimientos" />)

    expect(container.firstElementChild).toHaveClass(
      'bg-card',
      'rounded-2xl',
      'text-center',
    )
  })
})

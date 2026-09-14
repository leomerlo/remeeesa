import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Switch } from './switch'

function thumb(): Element {
  const node = document.querySelector('[data-slot="switch-thumb"]')
  expect(node).not.toBeNull()
  return node as Element
}

describe('Switch', () => {
  it('reads as an outline control when off, not as a filled grey one', () => {
    render(<Switch aria-label="Recurrente" />)

    const control = screen.getByRole('switch')
    expect(control).toHaveClass('border-2', 'border-border', 'bg-transparent')
    // Off used to be a filled grey track with a white thumb, which looked
    // exactly like the disabled switch beside it.
    expect(control).not.toHaveClass('bg-muted')
    expect(thumb()).toHaveClass('data-[state=unchecked]:bg-muted-foreground')
  })

  it('fills with the action colour when on', () => {
    render(<Switch aria-label="Recurrente" defaultChecked />)

    expect(screen.getByRole('switch')).toHaveClass(
      'data-[state=checked]:bg-primary',
      'data-[state=checked]:border-transparent',
    )
    expect(thumb()).toHaveClass('data-[state=checked]:bg-background')
  })

  it('dims the whole control when disabled', () => {
    render(<Switch aria-label="Débito automático" disabled />)

    const control = screen.getByRole('switch')
    expect(control).toBeDisabled()
    expect(control).toHaveClass(
      'disabled:opacity-50',
      'disabled:cursor-not-allowed',
    )
  })

  it('reports the new state when toggled', () => {
    const onCheckedChange = vi.fn()
    render(<Switch aria-label="Recurrente" onCheckedChange={onCheckedChange} />)

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('does not toggle while disabled', () => {
    const onCheckedChange = vi.fn()
    render(
      <Switch
        aria-label="Débito automático"
        disabled
        onCheckedChange={onCheckedChange}
      />,
    )

    fireEvent.click(screen.getByRole('switch'))

    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

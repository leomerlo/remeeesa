import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '@/lib/expenses'
import { CategoryChips } from './CategoryChips'

function category(name: string, color: string): Category {
  return {
    id: `id-${name}`,
    householdId: 'household-1',
    name,
    color,
    createdAt: new Date('2026-01-01T12:00:00'),
  }
}

const CATEGORIES = [
  category('Comida', '#df473c'),
  category('Transporte', '#5394c7'),
]

describe('CategoryChips', () => {
  it('offers one chip per existing category', () => {
    render(
      <CategoryChips categories={CATEGORIES} value="" onChange={() => {}} />,
    )

    expect(screen.getByRole('button', { name: /Comida/ })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Transporte/ }),
    ).toBeInTheDocument()
  })

  it('picks a category by tapping its chip', () => {
    const onChange = vi.fn()
    render(
      <CategoryChips categories={CATEGORIES} value="" onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Comida/ }))

    expect(onChange).toHaveBeenCalledWith('Comida')
  })

  it('marks only the selected chip as pressed, matching case-insensitively', () => {
    render(
      <CategoryChips
        categories={CATEGORIES}
        value="comida"
        onChange={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: /Comida/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /Transporte/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  // A mis-tap should not strand the form on a category the user then has to
  // retype over.
  it('clears the selection when the selected chip is tapped again', () => {
    const onChange = vi.fn()
    render(
      <CategoryChips
        categories={CATEGORIES}
        value="Comida"
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Comida/ }))

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('carries each category’s own colour', () => {
    render(
      <CategoryChips categories={CATEGORIES} value="" onChange={() => {}} />,
    )

    const chip = screen.getByRole('button', { name: /Comida/ })
    const swatch = within(chip).getByRole('generic', { hidden: true })
    expect(swatch).toHaveStyle({ backgroundColor: '#df473c' })
  })

  // Per direct feedback: a household with enough categories to wrap onto
  // several lines pushed the rest of the form down -- one swipeable row
  // instead.
  it('lays chips out in one non-wrapping, horizontally-scrollable row', () => {
    const { container } = render(
      <CategoryChips categories={CATEGORIES} value="" onChange={() => {}} />,
    )

    const row = container.firstElementChild
    expect(row).not.toBeNull()
    expect(row?.className).toContain('flex-nowrap')
    expect(row?.className).toContain('overflow-x-auto')
    expect(screen.getByRole('button', { name: /Comida/ }).className).toContain(
      'shrink-0',
    )
  })

  it('renders nothing at all before any category exists', () => {
    const { container } = render(
      <CategoryChips categories={[]} value="" onChange={() => {}} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})

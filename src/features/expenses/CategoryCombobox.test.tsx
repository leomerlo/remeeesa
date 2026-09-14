import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '@/lib/expenses'
import { CategoryCombobox } from './CategoryCombobox'

function category(name: string, color: string): Category {
  return {
    id: `cat-${name.toLowerCase()}`,
    householdId: 'house-1',
    name,
    color,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  }
}

const categories = [
  category('Comida', '#ff0000'),
  category('Servicios', '#00ff00'),
  category('Transporte', '#0000ff'),
]

function renderCombobox(value = '') {
  const onChange = vi.fn()
  const view = render(
    <CategoryCombobox
      id="category"
      categories={categories}
      value={value}
      onChange={onChange}
    />,
  )
  return { onChange, ...view }
}

describe('CategoryCombobox', () => {
  it('lists every category once the field is focused', () => {
    renderCombobox()

    fireEvent.focus(screen.getByRole('combobox'))

    expect(
      screen.getAllByRole('option').map((node) => node.textContent),
    ).toEqual(['Comida', 'Servicios', 'Transporte'])
  })

  it('gives every option the category icon on its own colour', () => {
    renderCombobox()

    fireEvent.focus(screen.getByRole('combobox'))

    const [comida] = screen.getAllByRole('option')
    const swatch = comida.querySelector('[style*="--swatch-color"]')
    expect(swatch).not.toBeNull()
    expect(swatch?.getAttribute('style')).toContain('#ff0000')
    // Decorative: the option's accessible name is the category name alone.
    expect(swatch?.querySelector('svg')).not.toBeNull()
    expect(comida).toHaveTextContent('Comida')
  })

  it('filters the list as the user types', () => {
    renderCombobox('trans')

    fireEvent.focus(screen.getByRole('combobox'))

    expect(
      screen.getAllByRole('option').map((node) => node.textContent),
    ).toEqual(['Transporte'])
  })

  it('reports the typed name for a category that does not exist yet', () => {
    const { onChange } = renderCombobox()

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'Mascotas' },
    })

    expect(onChange).toHaveBeenCalledWith('Mascotas')
  })

  it('says so when nothing matches, instead of an empty list', () => {
    renderCombobox('Mascotas')

    fireEvent.focus(screen.getByRole('combobox'))

    expect(screen.queryAllByRole('option')).toEqual([])
    expect(
      screen.getByText('No hay categorías que coincidan'),
    ).toBeInTheDocument()
  })

  it('reports the chosen category when an option is clicked', () => {
    const { onChange } = renderCombobox()

    fireEvent.focus(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Servicios' }))

    expect(onChange).toHaveBeenCalledWith('Servicios')
  })

  it('shows the matching category swatch inside the field once it is selected', () => {
    const { container } = renderCombobox('Servicios')

    const swatch = container.querySelector('[style*="--swatch-color"]')
    expect(swatch?.getAttribute('style')).toContain('#00ff00')
    expect(swatch?.querySelector('svg')).not.toBeNull()
  })

  it('shows no swatch while the typed value matches no category', () => {
    const { container } = renderCombobox('Mascotas')

    expect(container.querySelector('[style*="--swatch-color"]')).toBeNull()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sheet } from './sheet'

describe('Sheet', () => {
  it('does not render children when closed', () => {
    render(
      <Sheet open={false} onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    expect(screen.queryByText('Sheet body')).not.toBeInTheDocument()
  })

  it('renders children and exposes the title as the accessible name when open', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Filter expenses">
        <p>Sheet body</p>
      </Sheet>,
    )

    expect(
      screen.getByRole('dialog', { name: 'Filter expenses' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) exactly once when the overlay is clicked', async () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    // Radix's outside-pointer-down listener attaches after a 0ms timeout, to
    // avoid reacting to the same click that opened the dialog.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const overlay = document.querySelector('[data-slot="sheet-overlay"]')
    expect(overlay).not.toBeNull()
    fireEvent.pointerDown(overlay as Element)
    fireEvent.click(overlay as Element)

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('has a close control with a 44x44 (h-11 w-11) hit area', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    const closeButton = screen.getByRole('button', { name: 'Cerrar' })
    expect(closeButton).toHaveClass('h-11', 'w-11')
  })

  it('calls onOpenChange(false) exactly once when the close control is clicked', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls onOpenChange(false) exactly once when Escape is pressed', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders with an empty-string title and exposes an empty accessible name', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="">
        <p>Sheet body</p>
      </Sheet>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('')
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })

  it('renders multiple and nested children content', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <h2>Heading</h2>
        <p>Paragraph one</p>
        <div>
          <span>Nested span</span>
          <button type="button">Inner action</button>
        </div>
      </Sheet>,
    )

    expect(screen.getByText('Heading')).toBeInTheDocument()
    expect(screen.getByText('Paragraph one')).toBeInTheDocument()
    expect(screen.getByText('Nested span')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Inner action' }),
    ).toBeInTheDocument()
  })

  it('re-shows children after open toggles from true to false to true', () => {
    const { rerender } = render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(screen.getByText('Sheet body')).toBeInTheDocument()

    rerender(
      <Sheet open={false} onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(screen.queryByText('Sheet body')).not.toBeInTheDocument()

    rerender(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })

  it('updates the accessible name when the title prop changes on rerender', () => {
    const { rerender } = render(
      <Sheet open onOpenChange={() => {}} title="First title">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(
      screen.getByRole('dialog', { name: 'First title' }),
    ).toBeInTheDocument()

    rerender(
      <Sheet open onOpenChange={() => {}} title="Second title">
        <p>Sheet body</p>
      </Sheet>,
    )
    expect(
      screen.getByRole('dialog', { name: 'Second title' }),
    ).toBeInTheDocument()
  })

  it('does not call onOpenChange when clicking content inside the sheet', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    fireEvent.click(screen.getByText('Sheet body'))

    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('does not call onOpenChange when an interactive child is clicked', () => {
    const onOpenChange = vi.fn()
    const onInnerClick = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <button type="button" onClick={onInnerClick}>
          Inner action
        </button>
      </Sheet>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Inner action' }))

    expect(onInnerClick).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('closes immediately with a single call and no confirmation prompt', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    // No confirmation UI should appear before/instead of the close call.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('constrains content height and makes only the body scrollable so tall content stays reachable', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).toHaveClass('max-h-[96vh]')

    const body = document.querySelector('[data-slot="sheet-body"]')
    // `min-h-0` is required here: without it, a flex item's default
    // `min-height: auto` keeps it from shrinking below its content size, so
    // it silently stops being height-constrained by Dialog.Content's
    // max-h-[96vh] for tall content. The scrolling itself (and a pinned
    // action footer) is each Sheet-hosted form's own responsibility -- see
    // e.g. AddExpenseForm -- rather than this body, so a tall form's submit
    // button never scrolls out of reach.
    expect(body).toHaveClass('flex', 'min-h-0', 'flex-col')
  })

  it('keeps the close control outside the scrollable body so it never scrolls out of reach', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    const closeButton = screen.getByRole('button', { name: 'Cerrar' })
    const body = document.querySelector('[data-slot="sheet-body"]')
    expect(body).not.toBeNull()
    expect(body?.contains(closeButton)).toBe(false)
  })

  it('has hover and focus-visible affordance classes on the close control', () => {
    render(
      <Sheet open onOpenChange={() => {}} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    const closeButton = screen.getByRole('button', { name: 'Cerrar' })
    expect(closeButton).toHaveClass(
      'hover:bg-muted',
      'focus-visible:border-ring',
      'focus-visible:ring-ring/50',
      'focus-visible:ring-3',
    )
  })

  it('stays open when the parent ignores onOpenChange (fully controlled, no internal state override)', () => {
    const onOpenChange = vi.fn()
    render(
      <Sheet open onOpenChange={onOpenChange} title="Sheet title">
        <p>Sheet body</p>
      </Sheet>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))

    expect(onOpenChange).toHaveBeenCalledTimes(1)
    // The `open` prop was never updated by the parent, so the sheet must
    // remain visible: it should not manage its own open/closed state.
    expect(screen.getByText('Sheet body')).toBeInTheDocument()
  })
})

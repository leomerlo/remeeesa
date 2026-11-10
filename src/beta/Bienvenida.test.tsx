import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Bienvenida } from './Bienvenida'
import { markWelcomeSeen, welcomeSeen } from './welcome'

// It is shown once. The whole point is the "once", so that is what is
// tested: what the second load does, not what the first one looks like.
describe('the welcome', () => {
  it('greets a browser that has not seen it', () => {
    render(<Bienvenida />)
    expect(
      screen.getByText('Bienvenidos al nuevo remeeesa'),
    ).toBeInTheDocument()
    expect(screen.getByText('Rediseñamos la app de cero.')).toBeInTheDocument()
  })

  it('does not come back after it is closed', () => {
    const first = render(<Bienvenida />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver mi mes' }))
    expect(
      screen.queryByText('Bienvenidos al nuevo remeeesa'),
    ).not.toBeInTheDocument()

    // The next load, which is a fresh mount against the same browser.
    first.unmount()
    render(<Bienvenida />)
    expect(
      screen.queryByText('Bienvenidos al nuevo remeeesa'),
    ).not.toBeInTheDocument()
  })

  // Closing it is reading it, however it was closed: the X in the corner
  // and Escape count the same as the button.
  it('counts the X in the corner as read', () => {
    const first = render(<Bienvenida />)
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    first.unmount()
    render(<Bienvenida />)
    expect(
      screen.queryByText('Bienvenidos al nuevo remeeesa'),
    ).not.toBeInTheDocument()
  })

  it('counts Escape as read', () => {
    const first = render(<Bienvenida />)
    fireEvent.keyDown(document, { key: 'Escape' })
    first.unmount()
    render(<Bienvenida />)
    expect(
      screen.queryByText('Bienvenidos al nuevo remeeesa'),
    ).not.toBeInTheDocument()
  })

  // A browser that refuses site data cannot remember the answer, so showing
  // the welcome would mean showing it on every load for ever. It stays
  // quiet instead, and nothing throws.
  it('stays quiet where nothing can be remembered', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('site data blocked')
      },
      setItem() {
        throw new Error('site data blocked')
      },
    })
    expect(() => render(<Bienvenida />)).not.toThrow()
    expect(
      screen.queryByText('Bienvenidos al nuevo remeeesa'),
    ).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})

describe('what the browser remembers', () => {
  it('is nothing until the welcome has been read', () => {
    expect(welcomeSeen()).toBe(false)
    markWelcomeSeen()
    expect(welcomeSeen()).toBe(true)
  })
})

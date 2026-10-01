import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '@/test/renderWithProviders'
import { DolarConverter } from './DolarConverter'

describe('DolarConverter', () => {
  it('converts the typed pesos at the blue rate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ venta: 1000 }),
      }),
    )
    renderWithProviders(<DolarConverter />)

    expect(await screen.findByText(/Dólar blue:/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Pesos a dólar blue'), {
      target: { value: '50000' },
    })
    expect(screen.getByText('≈ US$ 50,00')).toBeInTheDocument()
  })

  it('says so when the rate cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    renderWithProviders(<DolarConverter />)
    expect(
      await screen.findByText('Cotización no disponible'),
    ).toBeInTheDocument()
  })
})

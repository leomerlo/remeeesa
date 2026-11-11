import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeDolarBlueOverride } from '@/lib/dolarBlueOverride'
import { renderWithProviders } from '@/test/renderWithProviders'
import { Dolar, convert } from './Dolar'

// Rates of their own, so the test does not depend on the network: the
// suite has no fetch, and this is the same override the household types
// in when the published rate is not the one they are buying at.
//
// Two of them, because the counter has two sides: the cueva pays the
// lower figure for the dollars you hand over and charges the higher one
// for the dollars you take away. The widget opens on handing dollars
// over, so SELLING is the rate the untouched tests below convert at.
const SELLING = 1555
const BUYING = 1600

beforeEach(() => {
  writeDolarBlueOverride(SELLING, 'compra')
  writeDolarBlueOverride(BUYING, 'venta')
})

describe('the converter in the rail', () => {
  it('says which box is dollars and which is pesos', () => {
    renderWithProviders(<Dolar />)
    expect(screen.getByText('US$')).toBeInTheDocument()
    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('turns dollars into pesos', () => {
    renderWithProviders(<Dolar />)
    fireEvent.change(screen.getByLabelText('Dólares'), {
      target: { value: '2' },
    })
    expect(screen.getByLabelText('Pesos')).toHaveValue('3.110')
  })

  // The half that did not exist: the pesos box was read-only, so the
  // question could only ever be asked one way round.
  it('turns pesos into dollars', () => {
    renderWithProviders(<Dolar />)
    fireEvent.change(screen.getByLabelText('Pesos'), {
      target: { value: '3110' },
    })
    expect(screen.getByLabelText('Dólares')).toHaveValue('2')
  })

  it('leaves the other box empty when one is emptied', () => {
    renderWithProviders(<Dolar />)
    fireEvent.change(screen.getByLabelText('Dólares'), {
      target: { value: '' },
    })
    expect(screen.getByLabelText('Pesos')).toHaveValue('')
  })
})

describe('what each box shows', () => {
  it('works the other one out at the rate', () => {
    expect(convert({ side: 'usd', text: '10' }, SELLING)).toEqual({
      usd: '10',
      ars: '15550',
    })
    expect(convert({ side: 'ars', text: '15550' }, SELLING)).toEqual({
      usd: '10',
      ars: '15550',
    })
  })

  // Pesos whole, dollars to the cent: at 1.555 a peso, a rounded dollar
  // is a thousand pesos thrown away.
  it('keeps the centavos out and the cents in', () => {
    expect(convert({ side: 'usd', text: '1.5' }, SELLING).ars).toBe('2333')
    expect(convert({ side: 'ars', text: '1000' }, SELLING).usd).toBe('0.64')
  })

  it('works nothing out with no rate, or from an empty box', () => {
    expect(convert({ side: 'usd', text: '10' }, null)).toEqual({
      usd: '10',
      ars: '',
    })
    expect(convert({ side: 'ars', text: '  ' }, SELLING)).toEqual({
      usd: '',
      ars: '  ',
    })
  })
})

// Which way the change is going picks the rate, and the two are not the
// same number. Quoting one for both questions was wrong by the spread.
// Per direct feedback: "si yo tengo dólares y voy a la casa de cambio, me
// dan el más bajo; si tengo pesos y los quiero pagar en dólares, me dan
// el más alto".
describe('which side of the counter', () => {
  it('opens on handing dollars over, at the rate they pay', () => {
    renderWithProviders(<Dolar />)

    expect(
      screen.getByRole('button', { name: 'Vendo dólares' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByText(/Te pagan \$ ?1\.555 por cada dólar/),
    ).toBeInTheDocument()
  })

  it('converts at the other rate once the other side is chosen', () => {
    renderWithProviders(<Dolar />)

    fireEvent.click(screen.getByRole('button', { name: 'Compro dólares' }))

    expect(
      screen.getByText(/Te cobran \$ ?1\.600 por cada dólar/),
    ).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Dólares'), {
      target: { value: '2' },
    })
    expect(screen.getByLabelText('Pesos')).toHaveValue('3.200')
  })

  it('goes back to the first rate when the first side is chosen again', () => {
    renderWithProviders(<Dolar />)

    fireEvent.click(screen.getByRole('button', { name: 'Compro dólares' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vendo dólares' }))

    fireEvent.change(screen.getByLabelText('Dólares'), {
      target: { value: '2' },
    })
    expect(screen.getByLabelText('Pesos')).toHaveValue('3.110')
  })
})

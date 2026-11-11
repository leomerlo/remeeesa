import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { writeDolarBlueOverride } from '@/lib/dolarBlueOverride'
import { renderWithProviders } from '@/test/renderWithProviders'
import { Dolar, convert } from './Dolar'

// A rate of their own, so the test does not depend on the network: the
// suite has no fetch, and this is the same override the household types
// in when the published rate is not the one they are buying at.
const RATE = 1555

beforeEach(() => {
  writeDolarBlueOverride(RATE)
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
    expect(convert({ side: 'usd', text: '10' }, RATE)).toEqual({
      usd: '10',
      ars: '15550',
    })
    expect(convert({ side: 'ars', text: '15550' }, RATE)).toEqual({
      usd: '10',
      ars: '15550',
    })
  })

  // Pesos whole, dollars to the cent: at 1.555 a peso, a rounded dollar
  // is a thousand pesos thrown away.
  it('keeps the centavos out and the cents in', () => {
    expect(convert({ side: 'usd', text: '1.5' }, RATE).ars).toBe('2333')
    expect(convert({ side: 'ars', text: '1000' }, RATE).usd).toBe('0.64')
  })

  it('works nothing out with no rate, or from an empty box', () => {
    expect(convert({ side: 'usd', text: '10' }, null)).toEqual({
      usd: '10',
      ars: '',
    })
    expect(convert({ side: 'ars', text: '  ' }, RATE)).toEqual({
      usd: '',
      ars: '  ',
    })
  })
})

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCard, listCardPurchasesInMonth } from '@/lib/cards'
import { listExpensesInMonth } from '@/lib/expenses'
import type { Household } from '@/lib/households'
import { createMemoryHouseholdsDb } from '@/test/memoryHouseholdsDb'
import { renderWithProviders } from '@/test/renderWithProviders'
import { ImportarSheet } from './ImportarSheet'
import type { BetaSession } from '../data'

const FLOR = 'flor'
const NOVEMBER = {
  monthStart: new Date(2026, 10, 1),
  monthEnd: new Date(2026, 11, 1),
}

// The suite's clock sits in September; these rows are November, and the
// domain will not book a gasto in the future.
beforeEach(() => {
  vi.setSystemTime(new Date(2026, 10, 27, 12))
})

const HEAD =
  'Fecha;Movimiento;Categoría;Monto;Moneda;Método;Pagado;Todos los meses;Débito automático;Cuotas;Comentario'

async function house(): Promise<{
  readonly session: BetaSession
  readonly household: Household
}> {
  const db = createMemoryHouseholdsDb().asUser(FLOR)
  const { household } = await db.createHouseholdAndMembership({
    userId: FLOR,
    name: 'Casa Merlo',
    monthlyBudget: 500_000,
    displayName: 'Flor',
  })
  await createCard({
    db,
    householdId: household.id,
    name: 'Visa Crédito',
    kind: 'credito',
    currency: 'BOTH',
  })
  return {
    household,
    session: {
      userId: FLOR,
      householdId: household.id,
      displayName: 'Flor',
      db,
      adopt: vi.fn(),
      rename: vi.fn(),
    },
  }
}

// A real <input type="file"> cannot be typed into, so the file arrives the
// way the browser delivers it: a File on the input, and a change event.
function choose(...lines: string[]): void {
  const input = document.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('expected the file input')
  }
  const file = new File([`﻿${[HEAD, ...lines].join('\r\n')}\r\n`], 'mes.csv', {
    type: 'text/csv',
  })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

function open(it: Awaited<ReturnType<typeof house>>): void {
  renderWithProviders(
    <ImportarSheet
      open
      onClose={vi.fn()}
      session={it.session}
      household={it.household}
    />,
  )
}

describe('importing a spreadsheet', () => {
  it('writes nothing until the review is accepted', async () => {
    const it_ = await house()
    open(it_)
    choose('11/11/2026;Café Martinez;Café;4.600;;;;;;;')

    expect(await screen.findByText('Café Martinez')).toBeInTheDocument()
    // Still only a proposal: the month has not moved.
    expect(
      await listExpensesInMonth({
        db: it_.session.db,
        householdId: it_.household.id,
        ...NOVEMBER,
      }),
    ).toEqual([])
  })

  it('says what each row will become before it goes in', async () => {
    open(await house())
    choose(
      '11/11/2026;Café Martinez;Café;4.600;;;;;;;',
      '13/11/2026;Discos;Música;104.500;ARS;Visa Crédito;sí;no;no;3;',
      '14/11/2026;Swiss Medical;Salud;;;;no;sí;;;',
    )

    expect(await screen.findByText('Gasto')).toBeInTheDocument()
    expect(
      screen.getByText('Va al resumen de Visa Crédito, en 3 cuotas'),
    ).toBeInTheDocument()
    expect(screen.getByText('Queda por pagar este mes')).toBeInTheDocument()
  })

  it('marks a category the household does not have yet', async () => {
    open(await house())
    choose('27/11/2026;Bazar;Bolucompras;43.100;;;;;;;')

    expect(await screen.findByText(/Bolucompras · nueva/)).toBeInTheDocument()
  })

  it('writes the file once the household accepts it', async () => {
    const it_ = await house()
    open(it_)
    choose(
      '11/11/2026;Café Martinez;Café;4.600;;;;;;;',
      '13/11/2026;Discos;Música;104.500;ARS;Visa Crédito;sí;no;no;3;',
    )

    fireEvent.click(
      await screen.findByRole('button', { name: /Cargar 2 movimientos/ }),
    )

    expect(await screen.findByText(/Se cargaron/)).toBeInTheDocument()
    const expenses = await listExpensesInMonth({
      db: it_.session.db,
      householdId: it_.household.id,
      ...NOVEMBER,
    })
    expect(expenses.map((expense) => expense.name)).toEqual(['Café Martinez'])
    const purchases = await listCardPurchasesInMonth({
      db: it_.session.db,
      householdId: it_.household.id,
      ...NOVEMBER,
    })
    expect(purchases[0]).toMatchObject({ name: 'Discos', cuotas: 3 })
  })

  it('cancelling goes back without writing anything', async () => {
    const it_ = await house()
    open(it_)
    choose('11/11/2026;Café Martinez;Café;4.600;;;;;;;')

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(
      await screen.findByRole('button', { name: /Elegir el archivo/ }),
    ).toBeInTheDocument()
    expect(
      await listExpensesInMonth({
        db: it_.session.db,
        householdId: it_.household.id,
        ...NOVEMBER,
      }),
    ).toEqual([])
  })

  it('shows a bad row with its reason, and loads the rest anyway', async () => {
    const it_ = await house()
    open(it_)
    choose(
      '11/11/2026;Café Martinez;Café;4.600;;;;;;;',
      '11/11/2026;Super;Super;1.000;;Tarjeta Naranja;;;;;',
    )

    expect(
      await screen.findByText(
        /No tenés un método de pago que se llame "Tarjeta Naranja"/,
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cargar 1 movimiento/ }))

    await waitFor(async () => {
      const expenses = await listExpensesInMonth({
        db: it_.session.db,
        householdId: it_.household.id,
        ...NOVEMBER,
      })
      expect(expenses.map((expense) => expense.name)).toEqual(['Café Martinez'])
    })
  })

  it('refuses a file whose columns are not the ones it needs', async () => {
    open(await house())
    const input = document.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('no input')
    const file = new File(['Nombre;Precio\r\nCafé;100\r\n'], 'otra.csv', {
      type: 'text/csv',
    })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /le faltan columnas: fecha, categoria/,
    )
  })
})
